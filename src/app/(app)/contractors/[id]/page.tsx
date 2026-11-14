import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { isActionRender } from "@/lib/action-render";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordView } from "@/lib/recent-views";
import { getEnv } from "@/lib/env";
import { Badge, Section, textLinkClass } from "@/components/ui";
import { RailFact } from "@/components/rail";
import { BackLink } from "@/components/back-link";
import { ArchivedNotice, RecordMoreMenu } from "@/components/record-archive";
import { archivedLine, contractorArchiveRefusal, contractorJobsWhere, contractorOpenJobs } from "@/lib/archive";
import { STATUS_TONE, StatusBadge, StatusMark } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { dayLabel, fmtDay, toYmd, todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { portalAccess } from "@/lib/portal/access-state";
import { STATUS_LABEL, isActiveStatus, statusRank } from "@/lib/task-scope";
import { isTargetLate, targetOf } from "@/lib/tasks/list";
import { docOnFile, splitDocLines } from "@/lib/contacts";
import { setupProgressLine } from "@/lib/contractors/onboarding";
import { TRADE_LINKS, tradeLine } from "@/lib/contractors/trades";
import { ContactCompany, ContactName, ContactNotes, ContactSection } from "./contact-section";
import { PortalAccessCard } from "./portal-access-card";
import { OnboardingBadge } from "../status-badge";
import { statusOf } from "../query";
import { setContractorArchived } from "../actions";
import type { Metadata } from "next";
import { recordMetadata } from "@/lib/record-metadata";

/** The tab names the record (record-title.ts), so tabs and history can be told apart. */
export async function generateMetadata({ params }: PageProps<"/contractors/[id]">): Promise<Metadata> {
  return recordMetadata("contractor", (await params).id);
}

/** The Jobs list's length; the heading's count is every job. */
const JOBS_SHOWN = 60;

/**
 * The origin for the sign-in link in the login text: APP_URL, or this
 * request's own origin until APP_URL is set (getEnv().appUrl throws in
 * production without it, which would take the whole page down).
 */
async function signInOrigin(): Promise<string> {
  const env = getEnv();
  if (env.APP_URL) return env.appUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : env.appUrl;
}

/** A document opened in a new tab, so the record stays open behind it. */
function DocLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={textLinkClass}>
      View
      <ArrowUpRight className="ml-0.5 inline size-3.5 align-middle" aria-hidden="true" />
    </a>
  );
}

export default async function ContractorPage({ params }: PageProps<"/contractors/[id]">) {
  const { id } = await params;
  // The session check runs beside the first reads and is awaited with them, so nothing is shown without it.
  const [me, c, open] = await Promise.all([
    requireUser(),
    prisma.contact.findUnique({
      where: { id },
      include: {
        // Never the password hash: only what the Portal access card shows.
        portalAccount: {
          select: { id: true, email: true, status: true, mustChangePassword: true, lastSignInAt: true, lastSeenAt: true, jobEmails: true },
        },
        archivedByUser: { select: { name: true, email: true } },
        tradeLinks: TRADE_LINKS,
        // The newest personal invite: when it was sent, opened, and whether it still works (the badge and the card's lines).
        portalInvites: { where: { shared: false }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, openedAt: true, expiresAt: true } },
        // The newest upload of each kind opens in the W-9 and Insurance facts.
        documents: { orderBy: { createdAt: "desc" }, select: { id: true, kind: true } },
      },
    }),
    // For Archive's refusal: open jobs are reassigned first, counted as the archive counts them (lib/archive.ts),
    // with the imported name-only ones the Tasks filter files under them. Their names bring those jobs into the list.
    contractorOpenJobs(prisma, id),
  ]);
  if (!c) notFound();
  const trades = tradeLine(c.tradeLinks) ?? "";
  // Their jobs: tasks assigned to this contact, and the open ones only an imported name ties to them, so the list
  // shows every job Archive's refusal counts. Never a playbook's template rows. The list stops at JOBS_SHOWN and
  // says so; the count is all of them.
  const jobsWhere = contractorJobsWhere(id, open.names);
  const [rows, jobCount, allTrades] = await Promise.all([
    prisma.task.findMany({
      where: jobsWhere,
      orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { dueDate: { sort: "asc", nulls: "last" } }],
      include: { property: { select: { id: true, address: true } } },
      take: JOBS_SHOWN,
    }),
    prisma.task.count({ where: jobsWhere }),
    // What the Trades checklist offers.
    prisma.trade.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  // Puts them on top of this person's Recent in search, once the response is out (not again for an edit's refresh).
  if (!(await isActionRender())) after(() => recordView(me.id, "CONTACT", c.id));
  const phone = c.phoneE164 ?? c.phone;
  const access = c.portalAccount ? portalAccess(c.portalAccount, c.active) : null;
  const status = statusOf(c);
  const w9OnFile = docOnFile(c.comments, "W-9");
  // An uploaded file (the files route, staff only) wins over an old Drive link, which wins over a name in the notes.
  const w9Upload = c.documents.find((d) => d.kind === "W9");
  const coiUpload = c.documents.find((d) => d.kind === "INSURANCE");
  const w9Href = w9Upload ? `/api/files/contact/${w9Upload.id}` : c.w9Url;
  const coiHref = coiUpload ? `/api/files/contact/${coiUpload.id}` : c.coiUrl;
  const fromInvite = c.signupSource !== "STAFF";
  const coiOnFile = docOnFile(c.comments, "Insurance");
  // The import's "W-9 on file:" lines show as the W-9 and Insurance rows, not as notes.
  const { notes } = splitDocLines(c.comments);

  // Buffalo's calendar day for each date the card and the Bank fact name ("Nov 14").
  const todayDay = todayYmdEastern();
  const dayOf = (d: Date) => fmtDay(todayYmdEastern(d), { year: "auto", now: todayDay });
  const invite = c.portalInvites[0] ?? null;
  const inviteView =
    fromInvite && !c.portalAccount && invite
      ? invite.openedAt
        ? { state: "opened" as const, line: `Opened ${dayOf(invite.openedAt)} · no account yet` }
        : {
            state: "invited" as const,
            line: invite.expiresAt && invite.expiresAt <= new Date() ? `Sent ${dayOf(invite.createdAt)} · expired` : `Sent ${dayOf(invite.createdAt)} · not opened`,
          }
      : null;

  const tasks = rows.sort((a, b) => statusRank(a.status) - statusRank(b.status));
  // Buffalo's calendar day, not the server's (UTC on Vercel rolls over at 8pm).
  const today = todayYmdEastern();

  return (
    // A record: capped at 1200, with a 320 rail beside the jobs once the page
    // is wide enough (docs/brand-guidelines.md, section 5). The rail comes
    // first in the markup, so a phone shows how to reach them before the jobs.
    // The trade-off: beside Jobs, keyboard and screen reader order runs
    // through the right-hand rail before the left-hand list.
    <div className="@container max-w-300">
      <BackLink fallback="/contractors" label="Contractors" />
      <div className="mt-2 mb-6">
        {/* The ⋯ menu is centered on the name's first line, as on a task's page: the heading's 4px padding and half its line, less half the 32px button (44 on touch). */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <ContactName id={c.id} name={c.fullName} />
          </div>
          <div className="shrink-0 pt-1 pointer-coarse:-mt-px pointer-coarse:pt-0">
            <RecordMoreMenu
              kind="contractor"
              id={c.id}
              href={`/contractors/${c.id}`}
              archived={!!c.archivedAt}
              refusal={contractorArchiveRefusal({ openJobs: open.count, hasLogin: c.portalAccount?.status === "ACTIVE" })}
              action={setContractorArchived}
            />
          </div>
        </div>
        {/* The company is edited here, not in Contact. At rest it is as wide as its words, so the badge sits beside it; open, it takes the line. */}
        <div className="mt-1 flex min-w-0 items-center gap-2 text-meta">
          <div className="-my-1 flex min-w-0 has-[input]:flex-1">
            <ContactCompany id={c.id} fullName={c.fullName} company={c.company} />
          </div>
          {status && <OnboardingBadge status={status} className="shrink-0" />}
          {c.tenantFixes && <Badge className="shrink-0">Tenant fixes</Badge>}
        </div>
        {c.archivedAt && (
          <ArchivedNotice
            className="mt-4"
            kind="contractor"
            id={c.id}
            line={archivedLine(c.archivedByUser, c.archivedAt)}
            action={setContractorArchived}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 pointer-coarse:gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:gap-10">
        <aside className="min-w-0 space-y-8 pointer-coarse:space-y-6 @4xl:col-start-2 @4xl:row-start-1">
          <ContactSection
            contact={{
              id: c.id,
              fullName: c.fullName,
              company: c.company,
              trades,
              phone: c.phone,
              phoneE164: c.phoneE164,
              email: c.email,
              mailingAddress: c.mailingAddress,
              billingInfo: c.billingInfo,
              availability: c.availability,
              tenantFixes: c.tenantFixes,
              comments: notes,
            }}
            portalEmail={c.portalAccount?.email ?? null}
            tradeOptions={allTrades.map((t) => t.name)}
            tradesNote={c.tradesNote}
          >
            {/* What isn't edited here yet: the documents, which the uploads work takes. */}
            <RailFact label="W-9">{w9Href ? <DocLink href={w9Href} /> : w9OnFile ? "On file" : null}</RailFact>
            <RailFact
              label={
                <>
                  Insurance<span className="max-sm:hidden"> (COI)</span>
                </>
              }
            >
              {coiHref ? <DocLink href={coiHref} /> : coiOnFile ? "On file" : c.noInsurance ? "No insurance" : null}
            </RailFact>
            {/* Bank details live in Baselane, never here; for someone who signed up, this says the link went. */}
            {fromInvite && c.baselaneSentAt && <RailFact label="Bank">Baselane link sent {dayOf(c.baselaneSentAt)}</RailFact>}
          </ContactSection>

          <ContactNotes
            contact={{
              id: c.id,
              fullName: c.fullName,
              company: c.company,
              trades,
              phone: c.phone,
              phoneE164: c.phoneE164,
              email: c.email,
              mailingAddress: c.mailingAddress,
              billingInfo: c.billingInfo,
              availability: c.availability,
              tenantFixes: c.tenantFixes,
              comments: notes,
            }}
          />

          <PortalAccessCard
            contactId={c.id}
            contactName={c.fullName}
            defaultEmail={c.email}
            phone={phone}
            appUrl={await signInOrigin()}
            archived={!!c.archivedAt}
            invite={inviteView ? { ...inviteView, hasEmail: !!c.email } : null}
            setupLine={fromInvite && c.portalAccount && !c.setupDoneAt ? setupProgressLine(c.setupStep) : null}
            account={
              c.portalAccount && access
                ? {
                    id: c.portalAccount.id,
                    email: c.portalAccount.email,
                    state: access.state,
                    line: access.line,
                    restorable: c.portalAccount.status !== "ACTIVE",
                    contactActive: c.active,
                    jobEmails: c.portalAccount.jobEmails,
                  }
                : null
            }
          />
        </aside>

        <Section
          className="min-w-0 @4xl:col-start-1 @4xl:row-start-1"
          title={
            <>
              Jobs
              {jobCount > 0 && <span className="num ml-1.5 font-normal text-fg-3">{jobCount}</span>}
            </>
          }
        >
          {tasks.length === 0 ? (
            <p className="text-body text-fg-3">No jobs assigned yet.</p>
          ) : (
            // Status as a mark and a word in one fixed column, then the job and
            // its place, then the date (section 9). Below 480 the row keeps two
            // lines: the mark leads, and the word and date move into the subline.
            <ul className="@container divide-y divide-line">
              {tasks.map((t) => {
                const closed = !isActiveStatus(t.status);
                // Their jobs show the Target (D7): the visit date while
                // Scheduled, otherwise Due. A closed job shows the day it closed.
                const dates = { status: t.status, scheduledFor: toYmd(t.scheduledFor), due: toYmd(t.dueDate) };
                const late = !closed && isTargetLate(dates, today);
                // completedAt is an instant: the Buffalo day it fell on.
                const day = closed ? (t.completedAt ? todayYmdEastern(t.completedAt) : null) : targetOf(dates);
                // Late shows the real date in --danger (section 3).
                const date = day ? (late ? fmtDay(day, { year: "auto", now: today }) : dayLabel(day, today)) : null;
                return (
                  <li
                    key={t.id}
                    className="relative grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 py-2.5 transition-colors hover:bg-fill-1 pointer-coarse:py-3 @min-[30rem]:grid-cols-[7rem_minmax(0,1fr)_6rem] @min-[30rem]:items-center"
                  >
                    {/* The whole row opens the job, as TaskRow does; the place's link sits above it. */}
                    <Link href={`/tasks/${t.id}`} className="absolute inset-0 -outline-offset-2">
                      <span className="sr-only">{t.title}</span>
                    </Link>
                    <span className="flex h-5 items-center pointer-coarse:h-5.5">
                      <StatusMark status={t.status} className="@min-[30rem]:hidden" />
                      <StatusBadge status={t.status} className="hidden @min-[30rem]:inline-flex" />
                    </span>
                    <div className="min-w-0">
                      <p aria-hidden="true" className={cn("truncate text-body", closed ? "text-fg-3 line-through" : "text-fg-1")}>
                        {t.title}
                      </p>
                      {/* Always there on a narrow row, where it carries the status word; a wide row shows it only for a place. */}
                      <p className={cn("truncate text-meta text-fg-3", !t.property && "@min-[30rem]:hidden")}>
                        <span className={cn("@min-[30rem]:hidden", STATUS_TONE[t.status])}>{STATUS_LABEL[t.status]}</span>
                        {t.property && (
                          <>
                            <span className="@min-[30rem]:hidden"> · </span>
                            {/* With a mouse the place opens the property; on touch the whole row opens the job. */}
                            <Link
                              href={`/properties/${t.property.id}`}
                              className="relative hover:text-fg-1 hover:underline pointer-coarse:pointer-events-none"
                            >
                              {shortAddress(t.property.address)}
                            </Link>
                          </>
                        )}
                        {/* Red belongs to the late date alone, not its separator. */}
                        {date && (
                          <span className="num @min-[30rem]:hidden">
                            {" · "}
                            <span className={cn(late && "text-danger")}>{date}</span>
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "num hidden text-right text-meta @min-[30rem]:block",
                        late ? "text-danger" : "text-fg-2",
                      )}
                    >
                      {date ?? <span className="text-fg-3">—</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {jobCount > tasks.length && <p className="mt-3 text-meta text-fg-3">Showing the latest {JOBS_SHOWN}</p>}
        </Section>
      </div>
    </div>
  );
}
