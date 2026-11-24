import type { EmailProblem, PrismaClient } from "@prisma/client";
import { escapeLike } from "@/lib/search";
import { fromAddress } from "./inbound";

/**
 * Mail that isn't getting through (docs/specs/emails-redesign.md, section 5).
 * Resend's webhook (src/app/api/email/inbound) reports what happened to each
 * email after it left: `email.bounced` (the receiving server refused it for
 * good), `email.suppressed` (Resend didn't send it: the address is on its
 * suppression list after a bounce or a spam report), `email.complained`
 * (delivered, then marked as spam) and `email.delivered`. A problem is kept on
 * the recipient, a contractor's login (PortalAccount) or a partner (User), and
 * the task page says "Emails don't reach Zack Miller." under a
 * partner's update (src/lib/tasks/delivery.ts). A later delivery to the same
 * address clears it, since one only happens once someone takes the address off
 * Resend's suppression list on purpose. A spam report also trips the
 * background jobs' check-in (src/lib/jobs-health.ts, `email_complained`), which
 * alerts Connor. Nothing here touches the contractor's Job emails switch.
 *
 * Idempotent and order-proof: each row keeps when Resend saw the newest event
 * applied (`emailEventAt`, the event's own `created_at`) and the address it was
 * about (`emailEventTo`). An event no newer than that changes nothing, so a
 * redelivered webhook, or a bounce that arrives after a later delivery, is a
 * no-op. A problem counts only while `emailEventTo` is still the row's address
 * (emailProblemOf), so changing the address clears it without a write here.
 *
 * Pure parsing plus writes through the client it is given, so the rules can be
 * tested on a scratch database (delivery-events.pg.test.ts). The only writer
 * of these columns.
 */

export type DeliveryEventKind = "bounced" | "suppressed" | "complained" | "delivered";

export interface DeliveryEvent {
  kind: DeliveryEventKind;
  /** The addresses it is about, bare and lowercased, each once. */
  to: string[];
  /** When Resend saw it: the event's own `created_at`, the order events apply in. */
  at: Date;
}

const PROBLEM: Record<Exclude<DeliveryEventKind, "delivered">, EmailProblem> = {
  bounced: "BOUNCED",
  suppressed: "SUPPRESSED",
  complained: "COMPLAINED",
};

const KIND_OF_TYPE = /^email\.(bounced|suppressed|complained|delivered)$/;

/** A Resend timestamp, or null when it isn't one. */
function when(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The delivery event in a webhook's JSON, or null for any other event (a
 * received email, an open, a click) or one that names no address. A bounce
 * Resend calls temporary is a delay, not an address that's gone, so it is
 * null too (Resend sends those as `email.delivery_delayed`; this is belt and
 * braces). The time is the event's own `created_at`, else the email's.
 */
export function deliveryEvent(event: unknown): DeliveryEvent | null {
  if (!event || typeof event !== "object") return null;
  const e = event as { type?: unknown; created_at?: unknown; data?: { to?: unknown; created_at?: unknown; bounce?: { type?: unknown } } };
  const kind = typeof e.type === "string" ? (KIND_OF_TYPE.exec(e.type)?.[1] as DeliveryEventKind | undefined) : undefined;
  if (!kind) return null;
  if (kind === "bounced" && /^(transient|temporary)$/i.test(String(e.data?.bounce?.type ?? ""))) return null;
  const raw = Array.isArray(e.data?.to) ? e.data.to : typeof e.data?.to === "string" ? [e.data.to] : [];
  const to = [...new Set(raw.filter((a): a is string => typeof a === "string").map(fromAddress).filter((a) => /^[^\s@]+@[^\s@]+$/.test(a)))];
  const at = when(e.created_at) ?? when(e.data?.created_at);
  if (to.length === 0 || !at) return null;
  return { kind, to, at };
}

/** What the readers select to call emailProblemOf. */
export const EMAIL_PROBLEM_SELECT = { email: true, emailProblem: true, emailEventTo: true } as const;

/** The problem on a login or a partner, while it is still about their current address; null otherwise. */
export function emailProblemOf(row: { email: string; emailProblem: EmailProblem | null; emailEventTo: string | null } | null | undefined): EmailProblem | null {
  if (!row?.emailProblem || !row.emailEventTo) return null;
  return row.emailEventTo === row.email.trim().toLowerCase() ? row.emailProblem : null;
}

type Db = Pick<PrismaClient, "portalAccount" | "user">;

/** What one event changed: the logins and partners it was recorded on (empty when it was old news). */
export interface DeliveryChange {
  kind: DeliveryEventKind;
  contactIds: string[];
  userIds: string[];
}

/**
 * Records one event on whoever it was sent to. A bounce or a spam report is
 * the newest fact and replaces what was there. A suppression never replaces a
 * problem already on that address: it is the bounce's or the spam report's
 * consequence (a complaint's next email comes back suppressed within minutes),
 * and keeping the cause keeps the complaint's alert up. A delivery clears a
 * problem older than itself.
 */
export async function recordDeliveryEvent(db: Db, ev: DeliveryEvent): Promise<DeliveryChange> {
  const change: DeliveryChange = { kind: ev.kind, contactIds: [], userIds: [] };
  for (const address of ev.to) {
    const unseen = { OR: [{ emailEventAt: null }, { emailEventAt: { lt: ev.at } }, { emailEventTo: null }, { emailEventTo: { not: address } }] };
    const where =
      ev.kind === "delivered"
        ? // Only a problem on this same address, older than the delivery.
          { emailProblem: { not: null }, emailEventTo: address, emailEventAt: { lt: ev.at } }
        : ev.kind === "suppressed"
          ? { AND: [unseen, { OR: [{ emailProblem: null }, { emailEventTo: null }, { emailEventTo: { not: address } }] }] }
          : unseen;
    const data =
      ev.kind === "delivered" ? { emailProblem: null, emailEventAt: ev.at } : { emailProblem: PROBLEM[ev.kind], emailEventAt: ev.at, emailEventTo: address };
    // A login's address is stored lowercased (accounts.ts); a partner's may not be, so theirs is matched without case,
    // with `_` and `%` escaped as replies.ts does.
    const accounts = await db.portalAccount.findMany({ where: { email: address, ...where }, select: { id: true, contactId: true } });
    if (accounts.length) {
      const { count } = await db.portalAccount.updateMany({ where: { id: { in: accounts.map((a) => a.id) }, ...where }, data });
      if (count) change.contactIds.push(...accounts.map((a) => a.contactId));
    }
    const users = await db.user.findMany({ where: { email: { equals: escapeLike(address), mode: "insensitive" }, ...where }, select: { id: true } });
    if (users.length) {
      const { count } = await db.user.updateMany({ where: { id: { in: users.map((u) => u.id) }, ...where }, data });
      if (count) change.userIds.push(...users.map((u) => u.id));
    }
  }
  return change;
}

/** Spam reports recorded since `since`, on logins and partners: the background jobs' `email_complained` reason. */
export async function complaintsSince(db: Db, since: Date): Promise<number> {
  const where = { emailProblem: "COMPLAINED" as const, emailEventAt: { gte: since } };
  const [accounts, users] = await Promise.all([db.portalAccount.count({ where }), db.user.count({ where })]);
  return accounts + users;
}
