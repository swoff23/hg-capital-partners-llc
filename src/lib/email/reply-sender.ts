import type { Prisma, TaskStatus, Visibility } from "@prisma/client";
import { JOB_EMAIL_SELECT, jobEmailState } from "@/lib/portal/job-emails";
import { hashToken, isWellFormedToken } from "@/lib/portal/tokens";
import { escapeLike } from "@/lib/search";
import { isActiveStatus } from "@/lib/task-scope";
import type { Principal } from "@/lib/tasks/core";
import { EMAIL_PROBLEM_SELECT, emailProblemOf } from "./delivery-events";
import { fromAddress, replyToken, singleAddress, threadTaskId, type CantPost } from "./inbound";

/**
 * Where a received email goes (docs/specs/contractor-job-emails.md, section 5;
 * docs/specs/emails-redesign.md, section 7): posted on its job, brought to
 * both partners by email, or dropped. The database half of replies.ts that
 * needs no network, so it runs on a scratch database in
 * reply-sender.pg.test.ts (replies.ts loads server-only and Blob).
 *
 *  - A reply through a job's reply address (`r+<token>@`, the token is the
 *    secret) posts as the person the email went to. A contractor who can't
 *    post there any more (taken off the job, their login off, the job closed,
 *    or an old address that Sign out everywhere or Remove access retired)
 *    doesn't lose it: it goes to both partners, the job named.
 *  - A partner's reply posts Shared, unless their link names the contractor
 *    the email was about (JobLink.contactId) and that contractor is no longer
 *    on the job: then Internal, so a note meant for Zack never reaches whoever
 *    has the job now.
 *  - Sent to the plain address instead, the From has to be vouched for by its
 *    domain (DMARC pass) and name one address. With a thread that names a job,
 *    it posts (or goes to the partners) as above; with none, a fresh email
 *    from a contractor's login goes to both partners. Anyone else is dropped.
 */

type Db = Pick<Prisma.TransactionClient, "jobLink" | "user" | "portalAccount" | "contact" | "task" | "taskAccess">;

/** What replies.ts reads off the received email to route it. */
export interface Envelope {
  from: string;
  to: readonly string[] | null;
  cc: readonly string[] | null;
  received_for: readonly string[] | null;
  headers: Readonly<Record<string, string>> | null;
  authentication: { dmarc?: string } | null;
}

/** The contractor a forwarded reply is from: who, where a note back goes, and whether a partner's reply reaches them. */
export interface ForwardFrom {
  contactId: string;
  fullName: string;
  /** Their login's address, for a note about files left out. Null without a login. */
  loginEmail: string | null;
  /**
   * A partner answering on the job would reach them: they still have the job, their login is on and signed in, their
   * Job emails are on, and nothing says their address bounces. The forward says "Reply to answer Zack Miller." only then.
   */
  reachable: boolean;
}

export type ReplyRoute =
  | { route: "post"; taskId: string; p: Principal; loginEmail: string; visibility: Visibility }
  | { route: "forward"; taskId: string | null; why: CantPost; from: ForwardFrom }
  | { route: "ignore"; reason: string };

/** The facts about a contractor and a job that decide whether their reply posts. */
export interface ContractorFacts {
  /** The reply came through a link that Sign out everywhere or Remove access retired. */
  linkRevoked: boolean;
  contactActive: boolean;
  accountStatus: string | null;
  /** An unrevoked access row on this job. */
  hasAccess: boolean;
  taskStatus: TaskStatus;
}

/**
 * Whether a contractor's reply posts, or why not, the first that applies: their login is off (or gone, or the
 * contact inactive), they don't have the job (taken off, or a draft), the job closed, or the link is a retired one.
 * The first three are the access rule core.ts assertContractorAccess holds a post to, plus a closed job's.
 */
export function contractorFate(f: ContractorFacts): "post" | Exclude<CantPost, "no-job"> {
  if (!f.contactActive || f.accountStatus !== "ACTIVE") return "login-off";
  if (!f.hasAccess || f.taskStatus === "DRAFT") return "off-task";
  if (!isActiveStatus(f.taskStatus)) return "closed";
  if (f.linkRevoked) return "old-link";
  return "post";
}

const ignore = (reason: string): ReplyRoute => ({ route: "ignore", reason });

/** Exact, case-insensitive: Prisma's insensitive equals is an ILIKE, so `_` and `%` in an address are escaped. */
const exactly = (address: string) => ({ equals: escapeLike(address), mode: "insensitive" as const });

/** A contractor on a job: whether their reply posts there, and what a forward needs. */
async function contractorOn(db: Db, taskId: string, contactId: string, linkRevoked: boolean) {
  const [task, contact, access] = await Promise.all([
    db.task.findUnique({ where: { id: taskId }, select: { status: true } }),
    db.contact.findUnique({
      where: { id: contactId },
      select: { id: true, fullName: true, active: true, portalAccount: { select: { ...JOB_EMAIL_SELECT, ...EMAIL_PROBLEM_SELECT } } },
    }),
    db.taskAccess.findUnique({ where: { taskId_contactId: { taskId, contactId } }, select: { revokedAt: true } }),
  ]);
  if (!task || !contact) return null;
  const account = contact.portalAccount;
  const hasAccess = !!access && !access.revokedAt;
  const fate = contractorFate({ linkRevoked, contactActive: contact.active, accountStatus: account?.status ?? null, hasAccess, taskStatus: task.status });
  const from: ForwardFrom = {
    contactId: contact.id,
    fullName: contact.fullName,
    loginEmail: account?.email.toLowerCase() ?? null,
    reachable: hasAccess && task.status !== "DRAFT" && jobEmailState(account, contact.active) === "on" && !emailProblemOf(account),
  };
  return { fate, from };
}

async function contractorRoute(db: Db, taskId: string, contactId: string, linkRevoked: boolean): Promise<ReplyRoute> {
  const on = await contractorOn(db, taskId, contactId, linkRevoked);
  if (!on) return ignore("no job");
  if (on.fate === "post" && on.from.loginEmail) {
    return {
      route: "post",
      taskId,
      p: { kind: "contractor", contactId, label: on.from.fullName, onlyTaskId: taskId },
      loginEmail: on.from.loginEmail,
      visibility: "SHARED",
    };
  }
  return { route: "forward", taskId, why: on.fate === "post" ? "login-off" : on.fate, from: on.from };
}

/**
 * A partner's reply: Shared, or Internal when their link names a contractor who is no longer on the job (taken off,
 * their login off, or the contact made inactive). Remove access leaves a partner's link alone (job-links.ts
 * revokeJobLinksFor), so a retired one was retired on purpose and posts nothing.
 */
async function partnerRoute(db: Db, link: { taskId: string; userId: string; contactId: string | null; revokedAt: Date | null }): Promise<ReplyRoute> {
  if (link.revokedAt) return ignore("no job");
  const user = await db.user.findUnique({ where: { id: link.userId }, select: { id: true, name: true, email: true } });
  if (!user) return ignore("no job");
  let visibility: Visibility = "SHARED";
  if (link.contactId) {
    const on = await contractorOn(db, link.taskId, link.contactId, false);
    if (!on) return ignore("no job");
    if (on.fate === "login-off" || on.fate === "off-task") visibility = "INTERNAL";
  }
  return { route: "post", taskId: link.taskId, p: { kind: "staff", userId: user.id, label: user.name ?? user.email }, loginEmail: user.email.toLowerCase(), visibility };
}

/**
 * Where this email goes. `jobsAddresses` are ours (EMAIL_FROM's and EMAIL_REPLY_TO's, bare and lowercased): a fresh
 * email reaches the partners only when it was sent to one of them, or to a reply address whose job is gone.
 */
export async function routeReply(db: Db, email: Envelope, jobsAddresses: readonly string[]): Promise<ReplyRoute> {
  const recipients = [...(email.to ?? []), ...(email.received_for ?? []), ...(email.cc ?? [])];
  const token = replyToken(recipients);
  if (token && isWellFormedToken(token)) {
    // Retired links too: a reply through one still has somewhere to go (the partners), it just can't post.
    const link = await db.jobLink.findUnique({ where: { tokenHash: hashToken(token) }, select: { kind: true, taskId: true, contactId: true, userId: true, revokedAt: true } });
    if (link && link.kind !== "REPLY") return ignore("no job");
    if (link?.userId) return partnerRoute(db, { ...link, userId: link.userId });
    if (link?.contactId) return contractorRoute(db, link.taskId, link.contactId, !!link.revokedAt);
    // No such link: its job was deleted, and its links with it. A known contractor's reply still reaches the partners
    // below, as a fresh email, when their domain vouches for them.
  }

  // A mail app that ignored Reply-To, or a fresh email: the From and a References header are easy to forge, so this
  // way in needs the sender's domain to vouch for the From (DMARC pass) and one address in the From line (a display
  // name that holds another address is a disguise). The r+ address above needs no such check: its token is the secret.
  if (email.authentication?.dmarc !== "pass") return ignore("no job");
  if (!singleAddress(email.from)) return ignore("no job");
  const from = fromAddress(email.from);
  const headers = email.headers ?? {};
  const threadId = threadTaskId(`${headers["references"] ?? ""} ${headers["in-reply-to"] ?? ""}`);
  const task = threadId ? await db.task.findUnique({ where: { id: threadId }, select: { id: true } }) : null;

  const user = await db.user.findFirst({ where: { email: exactly(from), passwordHash: { not: null } }, select: { id: true, name: true, email: true } });
  if (user) {
    // A partner writing in with no job to post on has the app; nothing to forward.
    if (!task) return ignore("no job");
    return { route: "post", taskId: task.id, p: { kind: "staff", userId: user.id, label: user.name ?? user.email }, loginEmail: user.email.toLowerCase(), visibility: "SHARED" };
  }
  const account = await db.portalAccount.findFirst({ where: { email: exactly(from) }, select: { contactId: true } });
  // Unknown senders are dropped.
  if (!account) return ignore("no job");
  if (task) return contractorRoute(db, task.id, account.contactId, false);

  // A fresh email from a contractor (no thread, or the job it names is gone), to the jobs address.
  const ours = new Set(jobsAddresses.map((a) => a.toLowerCase()));
  if (!token && !recipients.some((r) => ours.has(fromAddress(r)))) return ignore("no job");
  const contact = await db.contact.findUnique({
    where: { id: account.contactId },
    select: { id: true, fullName: true, active: true, portalAccount: { select: { ...JOB_EMAIL_SELECT, ...EMAIL_PROBLEM_SELECT } } },
  });
  if (!contact?.portalAccount) return ignore("no job");
  return {
    route: "forward",
    taskId: null,
    why: "no-job",
    // A partner's reply to this one goes straight to their address, so it reaches them whatever their job emails say.
    from: { contactId: contact.id, fullName: contact.fullName, loginEmail: contact.portalAccount.email.toLowerCase(), reachable: !emailProblemOf(contact.portalAccount) },
  };
}
