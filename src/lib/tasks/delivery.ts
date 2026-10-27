import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * What happened to a message after it posted (docs/specs/activity-comments.md
 * 2.6): did Zack get an email, did he open the job. The staff task page shows
 * it as one line under the newest entry he can see. Pure rules plus the
 * outbox read, taking the database client as an argument so it can be tested
 * and used from the page and from the delete toast alike.
 */

type Db = Pick<PrismaClient, "$queryRaw">;

/** An email still waiting, or one that went. */
export type EmailState = "queued" | "emailed";

/**
 * What an outbox row says about the email for an item inside it. "Emailed"
 * is sent with no error; a row that was closed unsent (no login, no access,
 * gave up) carries an error and says nothing, so the line never claims an
 * email that did not go. A row not sent yet is queued whether or not a run
 * has claimed it (`attempts` above zero means it is on its way).
 */
export function emailStateOf(row: { sentAt: Date | string | null; lastError: string | null }): EmailState | null {
  if (!row.sentAt) return "queued";
  return row.lastError ? null : "emailed";
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
  const rows = await db.$queryRaw<{ eventId: string; sentAt: Date | null; lastError: string | null }[]>`
    SELECT item->>'eventId' AS "eventId", o."sentAt", o."lastError"
    FROM "NotificationOutbox" o
    CROSS JOIN LATERAL jsonb_array_elements(o."items") AS item
    WHERE o."taskId" = ${taskId}
      AND o."recipientContactId" = ${contactId}
      AND item->>'eventId' IN (${Prisma.join([...eventIds])})`;
  const out = new Map<string, EmailState>();
  for (const r of rows) {
    const state = emailStateOf(r);
    if (state) out.set(r.eventId, state);
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
  if (input.email) return { state: input.email, to: input.to };
  return null;
}

/**
 * What the delete toast says about the email (activity 2.5): "Zack won't get
 * it" while it is still queued, "Zack already got the email" once it went,
 * nothing for an Internal comment or one that was never emailed.
 */
export function deleteEmailNote(email: EmailState | null, to: string | null): string | null {
  if (!email || !to) return null;
  return email === "queued" ? `${to} won't get it` : `${to} already got the email`;
}
