import type { Prisma } from "@prisma/client";
import { daysUntil, fmtDay, todayYmdEastern, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { activeTask, excludeTemplateTasks } from "@/lib/task-scope";

/**
 * Archive and Restore for deals, properties and contractors (Linear's,
 * Stripe's and HubSpot's pattern): an archived record leaves every list,
 * count, total, Home, search, the command palette and the pickers
 * (record-scope.ts says which), keeps its history, and comes back with
 * Restore. Nothing is deleted.
 *
 * The writes here take the transaction as an argument and hold no
 * `revalidatePath`, so archive.test.ts runs them on a fake; each domain's
 * service.ts wraps them in a transaction and refreshes its pages. Every
 * write records who did it: `archivedByUserId` for the record's line
 * ("Connor archived this today."), the row's last-editor stamp where it has
 * one (`updatedByUserId` on Deal and Property), and on a deal a line in its
 * log ("Connor archived this deal"). A change to the state it's already in
 * writes nothing, so two partners archiving at once log it once.
 */

export type ArchiveKind = "deal" | "property" | "contractor";

const NOUN: Record<ArchiveKind, string> = { deal: "Deal", property: "Property", contractor: "Contractor" };

/** The toast after Archive or Restore: "Deal archived", "Contractor restored". */
export function archiveToast(kind: ArchiveKind, archived: boolean): string {
  return `${NOUN[kind]} ${archived ? "archived" : "restored"}`;
}

/** Who archived it, as the record's line names them: their first name, else their email's name. */
function whoName(by: { name: string | null; email: string } | null | undefined): string | null {
  if (!by) return null;
  return firstName(by.name) || by.email.split("@")[0] || null;
}

/** "today", "yesterday" or "on Oct 27" (the year only when it isn't this one), by Buffalo's calendar. */
function whenWords(at: Date, today: Ymd): string {
  const day = todayYmdEastern(at);
  const d = daysUntil(day, today);
  if (d === 0) return "today";
  if (d === -1) return "yesterday";
  return `on ${fmtDay(day, { year: "auto", now: today })}`;
}

/**
 * The archived record's line, above its page: "Connor archived this today."
 * "Pieter archived this on Oct 27." When the user who did it is gone, it
 * names nobody: "Archived on Oct 27."
 */
export function archivedLine(by: { name: string | null; email: string } | null | undefined, at: Date, today: Ymd = todayYmdEastern()): string {
  const name = whoName(by);
  const when = whenWords(at, today);
  return name ? `${name} archived this ${when}.` : `Archived ${when}.`;
}

/**
 * Why a contractor can't be archived yet, naming the next step, or null when
 * they can. Open jobs are reassigned first and a portal login (an active
 * account) has its access removed first, so archiving never strands a job
 * or leaves someone able to sign in to a contractor nobody can find.
 *
 * It names the step that comes first, jobs and then access, and the line
 * under Archive changes once that is done. The line is also the toast after a
 * tap, which is one truncated line, so each stays within TOAST_PHONE_CHARS
 * (a line naming both steps was 48 characters and lost its ending on phones).
 */
export function contractorArchiveRefusal({ openJobs, hasLogin }: { openJobs: number; hasLogin: boolean }): string | null {
  if (openJobs > 0) return openJobs === 1 ? "Reassign their open job first." : `Reassign their ${openJobs} jobs first.`;
  if (hasLogin) return "Remove portal access first.";
  return null;
}

/* ---------------- The deal's log ---------------- */

export type ArchiveEvent = "archived" | "restored";

/** A deal log row's archive event (`DealNote.data.event`), or null for any other row. */
export function readArchiveEvent(data: unknown): ArchiveEvent | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const event = (data as Record<string, unknown>).event;
  return event === "archived" || event === "restored" ? event : null;
}

/** The log's sentence for one: "Connor archived this deal", "Someone restored this deal". */
export function archiveLogText(by: string | null, event: ArchiveEvent): string {
  return `${by || "Someone"} ${event} this deal`;
}

/* ---------------- The writes ---------------- */

/** The signed-in user doing it. */
export interface Archiver {
  id: string;
}

/** The part of a transaction the writes use. */
export type ArchiveTx = Pick<Prisma.TransactionClient, "deal" | "dealNote" | "property" | "contact" | "task">;

/** What a change writes on the row: who and when to archive, both cleared to restore. */
function archiveColumns(archived: boolean, by: Archiver, now: Date) {
  return archived ? { archivedAt: now, archivedByUserId: by.id } : { archivedAt: null, archivedByUserId: null };
}

/** Only a row in the other state is changed, so a repeat (a second partner, a double tap) writes nothing. */
const fromState = (archived: boolean) => (archived ? { archivedAt: null } : { archivedAt: { not: null } });

/**
 * Archive (or with `archived` false, restore) a deal, with its log line.
 * Returns whether anything changed; throws when the deal is gone.
 */
export async function setDealArchived(tx: ArchiveTx, id: string, archived: boolean, by: Archiver, now: Date = new Date()): Promise<boolean> {
  const r = await tx.deal.updateMany({
    where: { id, ...fromState(archived) },
    data: { ...archiveColumns(archived, by, now), updatedByUserId: by.id },
  });
  if (r.count === 0) {
    if (!(await tx.deal.findUnique({ where: { id }, select: { id: true } }))) throw new Error("This deal is gone.");
    return false;
  }
  const event: ArchiveEvent = archived ? "archived" : "restored";
  await tx.dealNote.create({
    data: {
      dealId: id,
      // The readable line for anything that reads text; the log words it from `data` (record-log.ts).
      body: archived ? "Deal archived" : "Deal restored",
      noteDate: now,
      source: "change",
      authorUserId: by.id,
      data: { event },
    },
  });
  return true;
}

/** Archive or restore a property. Its tasks, listings and documents stay as they are. */
export async function setPropertyArchived(tx: ArchiveTx, id: string, archived: boolean, by: Archiver, now: Date = new Date()): Promise<boolean> {
  const r = await tx.property.updateMany({
    where: { id, ...fromState(archived) },
    data: { ...archiveColumns(archived, by, now), updatedByUserId: by.id },
  });
  if (r.count === 0) {
    if (!(await tx.property.findUnique({ where: { id }, select: { id: true } }))) throw new Error("This property is gone.");
    return false;
  }
  return true;
}

/** Thrown when a contractor can't be archived yet; its message is the one line the toast shows. */
export class ArchiveRefusedError extends Error {}

/**
 * The open jobs and whether there's a login, for the refusal: tasks assigned
 * to them that are still open (never a playbook's template rows), and an
 * active portal account. A login whose access was removed isn't one.
 */
export async function contractorArchiveBlockers(tx: Pick<ArchiveTx, "task" | "contact">, id: string): Promise<{ openJobs: number; hasLogin: boolean } | null> {
  const [contact, openJobs] = await Promise.all([
    tx.contact.findUnique({ where: { id }, select: { portalAccount: { select: { status: true } } } }),
    tx.task.count({ where: { assigneeContactId: id, ...activeTask, ...excludeTemplateTasks } }),
  ]);
  if (!contact) return null;
  return { openJobs, hasLogin: contact.portalAccount?.status === "ACTIVE" };
}

/**
 * Archive or restore a contractor. Archive is refused while they have open
 * jobs or a portal login (`contractorArchiveRefusal`); portal accounts are
 * never touched here. Restore always goes through.
 */
export async function setContactArchived(tx: ArchiveTx, id: string, archived: boolean, by: Archiver, now: Date = new Date()): Promise<boolean> {
  if (archived) {
    const blockers = await contractorArchiveBlockers(tx, id);
    if (!blockers) throw new Error("This contractor is gone.");
    const refusal = contractorArchiveRefusal(blockers);
    if (refusal) throw new ArchiveRefusedError(refusal);
  }
  const r = await tx.contact.updateMany({ where: { id, ...fromState(archived) }, data: archiveColumns(archived, by, now) });
  if (r.count === 0) {
    if (!(await tx.contact.findUnique({ where: { id }, select: { id: true } }))) throw new Error("This contractor is gone.");
    return false;
  }
  return true;
}
