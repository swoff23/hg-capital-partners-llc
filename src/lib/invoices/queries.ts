import "server-only";
import type { InvoiceEventKind, InvoicePayMethod, InvoiceSource, InvoiceStage, Prisma, TaskStatus } from "@prisma/client";
import { easternDayStart, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { shortAddress } from "@/lib/normalize";
import {
  INVOICE_INBOX,
  VIEW_STAGE,
  approveBlocker,
  contractorInvoiceWhere,
  contractorStage,
  contractorStageWord,
  decimalToCents,
  invoiceTitle,
  type ContractorStage,
  type InvoiceView,
} from "./fields";

/**
 * The reads behind the Invoices page, an invoice's page, a task page's
 * Invoices section, Home's Needs you, and the portal's job page and Your
 * invoices (docs/contractor-invoices-plan.md, section 6). Money comes back
 * as integer cents read from the Decimal's text, never Number() of dollars;
 * any sum over invoices is SQL's or adds those cents.
 *
 * Staff reads (the first four) are for a caller that has already checked
 * requireUser(). The portal reads take who's asking and apply M14 and M16
 * themselves: their own invoices only, never Not an invoice, the ones that
 * didn't come from their own Send invoice only once approved, and nothing at
 * all in a link session.
 */

// ---------------------------------------------------------------------------
// The Invoices page
// ---------------------------------------------------------------------------

export interface InvoiceJob {
  /** Null once the job is deleted: the link reads as its kept title, with nowhere to go. */
  taskId: string | null;
  title: string;
  /** The street the job is at ("82 Hill St"), for the Invoices list; read only there. */
  place?: string | null;
}

export interface InvoiceRow {
  id: string;
  title: string;
  invoiceNumber: string | null;
  contact: { id: string; name: string } | null;
  /** The address an emailed invoice came from, shown in the contractor's place while there's none. */
  senderEmail: string | null;
  source: InvoiceSource;
  jobs: InvoiceJob[];
  /** The invoice date in To review and To pay; the paid date in Paid (6.1, item 3). */
  date: Ymd;
  totalCents: number | null;
  /** "Possible duplicate" (M10). */
  possibleDuplicate: boolean;
  /** "Who's this from?" (M11): no contractor on one that came in by email. A staff entry shows "No contractor" instead. */
  needsContractor: boolean;
}

export interface InvoiceCounts {
  review: number;
  pay: number;
  /** Not shown in the switch (6.1, item 3); for the list's footer. */
  paid: number;
}

export interface InvoiceList {
  view: InvoiceView;
  rows: InvoiceRow[];
  counts: InvoiceCounts;
  /** Invoice emails dropped over today's limits (4.3), for "4 invoice emails over today's limit weren't saved." */
  droppedToday: number;
}

const ROW_SELECT = {
  id: true,
  invoiceNumber: true,
  source: true,
  invoiceDate: true,
  paidOn: true,
  total: true,
  duplicateOfId: true,
  contact: { select: { id: true, fullName: true } },
  inboundEmail: { select: { from: true } },
  tasks: {
    select: { taskId: true, title: true, task: { select: { title: true, property: { select: { address: true } } } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.InvoiceSelect;

type RawRow = Prisma.InvoiceGetPayload<{ select: typeof ROW_SELECT }>;

const jobsOf = (tasks: RawRow["tasks"]): InvoiceJob[] =>
  tasks.map((t) => ({ taskId: t.taskId, title: t.task?.title ?? t.title, place: t.task?.property ? shortAddress(t.task.property.address) || t.task.property.address : null }));

function toRow(r: RawRow, view: InvoiceView): InvoiceRow {
  return {
    id: r.id,
    title: invoiceTitle({ invoiceNumber: r.invoiceNumber, contactName: r.contact?.fullName }),
    invoiceNumber: r.invoiceNumber,
    contact: r.contact ? { id: r.contact.id, name: r.contact.fullName } : null,
    senderEmail: r.inboundEmail?.from ?? null,
    source: r.source,
    jobs: jobsOf(r.tasks),
    date: toYmd(view === "paid" ? (r.paidOn ?? r.invoiceDate) : r.invoiceDate)!,
    totalCents: decimalToCents(r.total),
    possibleDuplicate: r.duplicateOfId != null,
    needsContractor: !r.contact && r.source !== "STAFF",
  };
}

/** To review and To pay, oldest first by the invoice date; Paid newest first by the paid date (6.1, item 3). */
const ORDER: Record<InvoiceView, Prisma.InvoiceOrderByWithRelationInput[]> = {
  review: [{ invoiceDate: "asc" }, { createdAt: "asc" }],
  pay: [{ invoiceDate: "asc" }, { createdAt: "asc" }],
  paid: [{ paidOn: "desc" }, { paidAt: "desc" }],
};

/** How many invoices are in each view. */
export async function invoiceCounts(): Promise<InvoiceCounts> {
  const groups = await prisma.invoice.groupBy({ by: ["stage"], where: { stage: { in: ["REVIEW", "TO_PAY", "PAID"] } }, _count: { _all: true } });
  const count = (s: InvoiceStage) => groups.find((g) => g.stage === s)?._count._all ?? 0;
  return { review: count("REVIEW"), pay: count("TO_PAY"), paid: count("PAID") };
}

/** Invoice emails dropped over the caps since Buffalo's midnight (4.3). */
export async function droppedInvoiceEmailsToday(now: Date = new Date()): Promise<number> {
  return prisma.inboundEmail.count({
    where: { localPart: INVOICE_INBOX, status: "OVER_CAP", receivedAt: { gte: easternDayStart(todayYmdEastern(now)) } },
  });
}

/** One view of the Invoices page, with every view's count. `limit` caps the rows, for a list footer's Show more. */
export async function listInvoices(view: InvoiceView, opts: { limit?: number; now?: Date } = {}): Promise<InvoiceList> {
  const [rows, counts, droppedToday] = await Promise.all([
    prisma.invoice.findMany({ where: { stage: VIEW_STAGE[view] }, select: ROW_SELECT, orderBy: ORDER[view], ...(opts.limit ? { take: opts.limit } : {}) }),
    invoiceCounts(),
    droppedInvoiceEmailsToday(opts.now),
  ]);
  return { view, rows: rows.map((r) => toRow(r, view)), counts, droppedToday };
}

// ---------------------------------------------------------------------------
// An invoice's page
// ---------------------------------------------------------------------------

export interface InvoiceFileRow {
  id: string;
  filename: string;
  contentType: string | null;
  size: number;
  width: number | null;
  height: number | null;
  hasThumb: boolean;
  createdAt: Date;
}

export interface InvoiceHistoryLine {
  id: string;
  kind: InvoiceEventKind;
  actorLabel: string;
  actorUserId: string | null;
  actorContactId: string | null;
  data: Prisma.JsonValue;
  createdAt: Date;
}

export interface InvoiceRecord {
  id: string;
  title: string;
  stage: InvoiceStage;
  source: InvoiceSource;
  contact: { id: string; name: string; email: string | null; archived: boolean } | null;
  invoiceNumber: string | null;
  invoiceDate: Ymd;
  totalCents: number | null;
  note: string | null;
  /** The line under a disabled Approve, or null when it can go (6.1, item 4). */
  approveBlocker: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  /** Set while Paid. `at` is the mark Undo paid takes (core.ts undoPaid). */
  paid: { on: Ymd; at: Date; method: InvoicePayMethod; note: string | null; by: string | null } | null;
  createdAt: Date;
  /** Who made it, as a name: the partner or the contractor. Null for an emailed one, which `email` names. */
  createdBy: string | null;
  deletedAt: Date | null;
  files: InvoiceFileRow[];
  jobs: (InvoiceJob & { linkId: string; status: TaskStatus | null })[];
  /** Oldest first. */
  history: InvoiceHistoryLine[];
  /** The older invoice this one may repeat (M10), with where it is now. */
  duplicateOf: { id: string; title: string; stage: InvoiceStage } | null;
  /** The email it came in: "From the email Zack sent Nov 18" and its words. */
  email: { from: string; subject: string | null; receivedAt: Date; text: string | null } | null;
}

const RECORD_SELECT = {
  id: true,
  stage: true,
  source: true,
  invoiceNumber: true,
  invoiceDate: true,
  total: true,
  note: true,
  approvedAt: true,
  paidOn: true,
  paidAt: true,
  payMethod: true,
  paidNote: true,
  createdAt: true,
  deletedAt: true,
  contact: { select: { id: true, fullName: true, email: true, archivedAt: true } },
  approvedBy: { select: { name: true, email: true } },
  paidBy: { select: { name: true, email: true } },
  createdByUser: { select: { name: true, email: true } },
  createdByContact: { select: { fullName: true } },
  files: {
    select: { id: true, filename: true, contentType: true, size: true, width: true, height: true, thumbPathname: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  tasks: { select: { id: true, taskId: true, title: true, task: { select: { title: true, status: true } } }, orderBy: { createdAt: "asc" } },
  events: {
    select: { id: true, kind: true, actorLabel: true, actorUserId: true, actorContactId: true, data: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  duplicateOf: { select: { id: true, invoiceNumber: true, stage: true, contact: { select: { fullName: true } } } },
  inboundEmail: { select: { from: true, subject: true, receivedAt: true, text: true } },
} satisfies Prisma.InvoiceSelect;

const personName = (u: { name: string | null; email: string } | null): string | null => (u ? u.name?.trim() || u.email : null);

export async function getInvoice(id: string): Promise<InvoiceRecord | null> {
  const r = await prisma.invoice.findUnique({ where: { id }, select: RECORD_SELECT });
  if (!r) return null;
  const totalCents = decimalToCents(r.total);
  return {
    id: r.id,
    title: invoiceTitle({ invoiceNumber: r.invoiceNumber, contactName: r.contact?.fullName }),
    stage: r.stage,
    source: r.source,
    contact: r.contact ? { id: r.contact.id, name: r.contact.fullName, email: r.contact.email, archived: !!r.contact.archivedAt } : null,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: toYmd(r.invoiceDate)!,
    totalCents,
    note: r.note,
    approveBlocker: r.stage === "REVIEW" ? approveBlocker({ contactId: r.contact?.id ?? null, totalCents }) : null,
    approvedAt: r.approvedAt,
    approvedBy: personName(r.approvedBy),
    paid:
      r.stage === "PAID" && r.paidOn && r.paidAt && r.payMethod
        ? { on: toYmd(r.paidOn)!, at: r.paidAt, method: r.payMethod, note: r.paidNote, by: personName(r.paidBy) }
        : null,
    createdAt: r.createdAt,
    createdBy: personName(r.createdByUser) ?? r.createdByContact?.fullName ?? null,
    deletedAt: r.deletedAt,
    files: r.files.map(({ thumbPathname, ...f }) => ({ ...f, hasThumb: !!thumbPathname })),
    jobs: r.tasks.map((t) => ({ linkId: t.id, taskId: t.taskId, title: t.task?.title ?? t.title, status: t.task?.status ?? null })),
    history: r.events,
    duplicateOf: r.duplicateOf
      ? { id: r.duplicateOf.id, title: invoiceTitle({ invoiceNumber: r.duplicateOf.invoiceNumber, contactName: r.duplicateOf.contact?.fullName }), stage: r.duplicateOf.stage }
      : null,
    email: r.inboundEmail,
  };
}

// ---------------------------------------------------------------------------
// A task page's Invoices section (M13) and Home's Needs you (M12)
// ---------------------------------------------------------------------------

export interface TaskInvoiceRow {
  id: string;
  title: string;
  invoiceNumber: string | null;
  /** Shown in the number's place when there's no number (6.1, item 6). */
  invoiceDate: Ymd;
  totalCents: number | null;
  stage: InvoiceStage;
  /** For the contractor's first name, shown only when a job's invoices come from more than one contractor. */
  contact: { id: string; name: string } | null;
}

/** A job's invoices, Not an invoice left out, oldest first. A canceled job still lists them. */
export async function invoicesForTask(taskId: string): Promise<TaskInvoiceRow[]> {
  const rows = await prisma.invoice.findMany({
    where: { tasks: { some: { taskId } }, stage: { not: "NOT_INVOICE" } },
    select: { id: true, invoiceNumber: true, invoiceDate: true, total: true, stage: true, contact: { select: { id: true, fullName: true } } },
    orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    title: invoiceTitle({ invoiceNumber: r.invoiceNumber, contactName: r.contact?.fullName }),
    invoiceNumber: r.invoiceNumber,
    invoiceDate: toYmd(r.invoiceDate)!,
    totalCents: decimalToCents(r.total),
    stage: r.stage,
    contact: r.contact ? { id: r.contact.id, name: r.contact.fullName } : null,
  }));
}

/**
 * Home's "2 invoices to review" (M12, 6.1 item 9): how many wait in To review, and who sent them, oldest first,
 * each once: the contractor's name, or the address an unmatched email came from. No dollar figure, since an
 * emailed invoice has no total until someone types it.
 */
export async function invoicesToReview(): Promise<{ count: number; senders: string[]; contractors: string[] }> {
  const rows = await prisma.invoice.findMany({
    where: { stage: "REVIEW" },
    select: { contact: { select: { fullName: true } }, inboundEmail: { select: { from: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const senders = [...new Set(rows.map((r) => r.contact?.fullName ?? r.inboundEmail?.from ?? null).filter((s): s is string => !!s))];
  // The ones with a contractor on them, by name, for the line Home names them in; an unmatched address only counts.
  const contractors = [...new Set(rows.flatMap((r) => (r.contact ? [r.contact.fullName] : [])))];
  return { count: rows.length, senders, contractors };
}

// ---------------------------------------------------------------------------
// The portal (M14, M16)
// ---------------------------------------------------------------------------

/** Who's asking in the portal, from requirePortalPrincipal(). */
export interface PortalViewer {
  contactId: string;
  /** Set on a session an email's job link started: it sees no invoice at all (M16). */
  onlyTaskId?: string | null;
}

export interface PortalInvoiceRow {
  id: string;
  title: string;
  invoiceNumber: string | null;
  /** Jobs it's for that the contractor can open; none reads "No job". */
  jobs: { taskId: string; title: string }[];
  totalCents: number | null;
  /** Received, Approved or Paid; Paid only once its Undo window has passed (M15). */
  stage: ContractorStage;
  /** "Received", "Approved", "Paid Nov 13". */
  stageWord: string;
  /**
   * The row's day (6.1, item 8): the Buffalo day it was sent, or for a partner's own entry (New invoice, Use as
   * invoice), which the contractor never sent, its invoice date.
   */
  sentOn: Ymd;
  /** The word before that day: "Sent", or "Dated" for a partner's own entry. */
  dateWord: "Sent" | "Dated";
  /** When it was sent, as an ISO instant: the viewer's byline, which needs the moment, not the day. */
  sentAt: string;
  /** For opening it in the viewer, signed in only (6.1, item 7). */
  files: { id: string; filename: string; contentType: string | null }[];
}

function portalSelect(contactId: string) {
  return {
    id: true,
    invoiceNumber: true,
    total: true,
    stage: true,
    paidOn: true,
    paidAt: true,
    createdAt: true,
    source: true,
    invoiceDate: true,
    files: { select: { id: true, filename: true, contentType: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    // A job staff tacked on that the contractor can't open (one that sits on Connor, say) isn't named to them.
    tasks: {
      where: { task: { access: { some: { contactId, revokedAt: null } } } },
      select: { taskId: true, task: { select: { title: true } } },
      orderBy: { createdAt: "asc" },
    },
  } satisfies Prisma.InvoiceSelect;
}

async function portalRows(viewer: PortalViewer, where: Prisma.InvoiceWhereInput, now: Date): Promise<PortalInvoiceRow[]> {
  if (viewer.onlyTaskId || !viewer.contactId) return [];
  const rows = await prisma.invoice.findMany({
    where: { AND: [contractorInvoiceWhere(viewer.contactId), where] },
    select: portalSelect(viewer.contactId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const today = todayYmdEastern(now);
  return rows.flatMap((r) => {
    const stage = contractorStage(r, now);
    if (!stage) return [];
    return [
      {
        id: r.id,
        title: invoiceTitle({ invoiceNumber: r.invoiceNumber }),
        invoiceNumber: r.invoiceNumber,
        jobs: r.tasks.flatMap((t) => (t.taskId && t.task ? [{ taskId: t.taskId, title: t.task.title }] : [])),
        totalCents: decimalToCents(r.total),
        stage,
        stageWord: contractorStageWord(r, now, today),
        sentOn: r.source === "STAFF" ? toYmd(r.invoiceDate)! : todayYmdEastern(r.createdAt),
        dateWord: r.source === "STAFF" ? "Dated" : "Sent",
        sentAt: r.createdAt.toISOString(),
        files: r.files,
      },
    ];
  });
}

/** Your invoices (`/p/invoices`): every invoice of theirs they may see, with or without a job, newest first. */
export async function contractorInvoices(viewer: PortalViewer, now: Date = new Date()): Promise<PortalInvoiceRow[]> {
  return portalRows(viewer, {}, now);
}

/**
 * A portal job's Invoices section: their invoices on this job, newest first. The caller has checked they can open
 * the job; the section shows only when this has a row.
 */
export async function jobInvoicesForContractor(viewer: PortalViewer, taskId: string, now: Date = new Date()): Promise<PortalInvoiceRow[]> {
  return portalRows(viewer, { tasks: { some: { taskId } } }, now);
}
