import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * What happened to a message after it posted (docs/specs/activity-comments.md
 * 2.6): did Zack get an email, did he open the job. The staff task page shows
 * it as one line under the newest entry he can see. Pure rules plus the
 * outbox read, taking the database client as an argument so it can be tested
 * and used from the page and from the delete toast alike.
 */

type Db = Pick<PrismaClient, "notificationOutbox">;

/**
 * Outbox rows holding a line about this event (`items @> [{"eventId": id}]`).
 * Read through the client: the only raw SQL that names the outbox is core.ts's
 * and the send run's (upload-guards.test.ts), so the rules for writing it
 * stay in one place.
 */
const namingEvent = (eventId: string) => ({ items: { array_contains: [{ eventId }] } }) satisfies Prisma.NotificationOutboxWhereInput;

/** The eventIds a row's items carry (old items carry none). */
function itemEventIds(items: Prisma.JsonValue): string[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((i) => (i && typeof i === "object" && !Array.isArray(i) && typeof i.eventId === "string" ? [i.eventId] : []));
}

/** An email still waiting, one a run has claimed and is sending, or one that went. */
export type EmailState = "queued" | "sending" | "emailed";

/**
 * What an outbox row says about the email for an item inside it. "Emailed"
 * is sent with no error; a row that was closed unsent (no login, no access,
 * gave up) carries an error and says nothing, so the line never claims an
 * email that did not go. A row not sent yet is queued; once a run has
 * claimed it (`attempts` above zero) it is on its way: it can no longer be
 * held back, so a delete says nothing about the email.
 */
export function emailStateOf(row: { sentAt: Date | string | null; lastError: string | null; attempts?: number }): EmailState | null {
  if (!row.sentAt) return (row.attempts ?? 0) > 0 ? "sending" : "queued";
  return row.lastError ? null : "emailed";
}

/**
 * What the contractor's update says about the partners' emails (activity 2.6,
 * portal side), from the outbox rows of the partners it went to: "queued"
 * while any has not gone, "emailed" once every one has with no error, and
 * nothing when a row was closed with an error (it told no one), so the line
 * never claims an email that did not go. No rows, no line.
 */
export function partnersEmailState(rows: readonly { sentAt: Date | string | null; lastError: string | null }[]): "queued" | "emailed" | null {
  if (rows.length === 0) return null;
  if (rows.some((r) => !r.sentAt)) return "queued";
  return rows.every((r) => !r.lastError) ? "emailed" : null;
}

/**
 * The email state of each event among `eventIds`, for what was queued to this
 * contractor on this task. An item holds its event's id (`OutboxItem.eventId`);
 * messages queued before that field existed have no row to find and are
 * simply missing from the map. Events that were never emailed (Internal
 * ones) are missing too.
 */
export async function emailStatesIn(db: Db, taskId: string, contactId: string, eventIds: readonly string[]): Promise<Map<string, EmailState>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db.notificationOutbox.findMany({
    where: { taskId, recipientContactId: contactId, OR: eventIds.map(namingEvent) },
    select: { items: true, sentAt: true, lastError: true, attempts: true },
  });
  const wanted = new Set(eventIds);
  const out = new Map<string, EmailState>();
  for (const r of rows) {
    const state = emailStateOf(r);
    if (!state) continue;
    for (const id of itemEventIds(r.items)) if (wanted.has(id)) out.set(id, state);
  }
  return out;
}

/** The line under a staff entry for the contractor it is addressed to. */
export type Delivery = { state: "no-login" | "queued" | "emailed" | "seen"; to: string | string[]; at?: string };

/**
 * The delivery line for one entry the contractor can see. No login says so
 * and nothing else (no email will go). Opened after the entry wins over the
 * email states, since it is the later fact. Otherwise the email: waiting, or
 * sent. Nothing for an entry with no email on record (one posted before the
 * outbox named its events).
 */
export function deliveryLine(input: {
  to: string;
  hasLogin: boolean;
  email: EmailState | null;
  /** When the contractor last opened the job. */
  seenAt: Date | string | null;
  /** When the entry was written. */
  eventAt: Date | string;
}): Delivery | null {
  if (!input.hasLogin) return { state: "no-login", to: input.to };
  const seen = input.seenAt ? new Date(input.seenAt) : null;
  if (seen && seen.getTime() > new Date(input.eventAt).getTime()) return { state: "seen", to: input.to, at: seen.toISOString() };
  // A row a run is sending is still "gets an email" to the person reading.
  if (input.email) return { state: input.email === "sending" ? "queued" : input.email, to: input.to };
  return null;
}

/**
 * What the delete toast says about the email (activity 2.5): "Zack won't get
 * it" while it is still queued, "Zack already got the email" once it went,
 * nothing for an Internal comment, one that was never emailed, or one a run
 * is sending right now (it can still go).
 */
export function deleteEmailNote(email: EmailState | null, to: string | null): string | null {
  if (!email || !to || email === "sending") return null;
  return email === "queued" ? `${to} won't get it` : `${to} already got the email`;
}

/**
 * Whether a contractor could have read a Shared comment by the time it comes
 * off: they had the job before it was written and have opened it since, or an
 * email carrying it went to them with no error. Opening the job later never
 * counts (that visit would find the comment gone), and an email row closed
 * with an error ("nothing to send", no login) said nothing to anyone.
 */
export function sawComment(
  contact: { accessSince: Date; lastSeenAt: Date | null; emails: readonly { sentAt: Date | null; lastError: string | null }[] },
  commentAt: Date,
): boolean {
  if (contact.accessSince.getTime() >= commentAt.getTime()) return false;
  if (contact.lastSeenAt && contact.lastSeenAt.getTime() > commentAt.getTime()) return true;
  return contact.emails.some((r) => r.sentAt !== null && !r.lastError);
}

/**
 * The contractors who could have read this Shared comment, read at the moment
 * it is deleted, while the facts are known (activity 2.5, question 3). The
 * portal's "Connor removed a comment" line shows to exactly these people and
 * to nobody who opens the job afterwards, so a comment Zack never saw leaves
 * no trace. `audienceContactId` null means any contractor with the job.
 */
export async function contactsWhoSaw(
  db: Pick<PrismaClient, "notificationOutbox" | "taskAccess" | "taskReadState">,
  ev: { id: string; taskId: string; createdAt: Date; audienceContactId: string | null },
): Promise<string[]> {
  const access = await db.taskAccess.findMany({
    where: { taskId: ev.taskId, revokedAt: null, ...(ev.audienceContactId ? { contactId: ev.audienceContactId } : {}) },
    select: { contactId: true, createdAt: true },
  });
  if (access.length === 0) return [];
  const ids = access.map((a) => a.contactId);
  const [seen, emails] = await Promise.all([
    db.taskReadState.findMany({ where: { taskId: ev.taskId, contactId: { in: ids } }, select: { contactId: true, lastSeenAt: true } }),
    db.notificationOutbox.findMany({
      where: { taskId: ev.taskId, recipientContactId: { not: null }, ...namingEvent(ev.id) },
      select: { recipientContactId: true, sentAt: true, lastError: true },
    }),
  ]);
  return access
    .filter((a) =>
      sawComment(
        {
          accessSince: a.createdAt,
          lastSeenAt: seen.find((r) => r.contactId === a.contactId)?.lastSeenAt ?? null,
          emails: emails.filter((r) => r.recipientContactId === a.contactId),
        },
        ev.createdAt,
      ),
    )
    .map((a) => a.contactId);
}
