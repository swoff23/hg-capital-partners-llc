import type { InvoiceEventKind, InvoiceSource } from "@prisma/client";
import { fmtDay, type Ymd } from "@/lib/dates";
import { formatCents } from "@/lib/invoices/email-content";
import { decimalToCents } from "@/lib/invoices/fields";
import { firstName } from "@/lib/names";

/**
 * The invoice page's History in words (docs/contractor-invoices-plan.md, section 6). One line per event, in the
 * drawing's voice: "Came in by email from Zack", "Connor added 2 jobs", "Pieter approved it", "Connor marked it paid".
 * Pure; see history-lines.test.ts. The timeline folds a run of edits with collapseStretches, so the moves and the
 * arrival stay in view (`isMove`).
 */

export interface HistoryEvent {
  id: string;
  kind: InvoiceEventKind;
  actorLabel: string;
  data: unknown;
  createdAt: Date;
}

/** An event line's words, with the short name of what changed (for "Show 4 updates: total, jobs…"). */
export interface HistoryLine {
  id: string;
  text: string;
  /** "contractor", "total", "jobs": what an edit changed. Empty for a move. */
  kind: string;
  /** A move or the arrival: the lines a fold never hides. */
  anchor: boolean;
  createdAt: Date;
}

type Data = Record<string, unknown>;

const asData = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** A field's value as it reads in a line: a total as dollars, a date as "Nov 18", the rest as typed. */
function shown(field: string, v: string | null, today: Ymd): string | null {
  if (v == null) return null;
  if (field === "total") {
    const cents = decimalToCents(v);
    return cents == null ? v : formatCents(cents);
  }
  if (field === "invoiceDate") return fmtDay(v, { year: "auto", now: today });
  return v;
}

const FIELD_WORDS: Record<string, { noun: string; kind: string }> = {
  contractor: { noun: "the contractor", kind: "contractor" },
  invoiceNumber: { noun: "the invoice number", kind: "number" },
  invoiceDate: { noun: "the invoice date", kind: "date" },
  total: { noun: "the total", kind: "total" },
  note: { noun: "the note", kind: "note" },
};

const ARRIVED: Record<InvoiceSource, string> = {
  PORTAL: "sent it from a job",
  REPLY: "replied to a job email with it",
  EMAIL: "Came in by email",
  STAFF: "added it",
};

function edited(who: string, d: Data, today: Ymd): { text: string; kind: string } {
  const field = str(d.field) ?? "";
  if (field === "jobs") {
    if (str(d.added)) return { text: `${who} added the job ${d.added as string}`, kind: "jobs" };
    if (str(d.removed)) return { text: `${who} took off the job ${d.removed as string}`, kind: "jobs" };
    return { text: `${who} changed the jobs`, kind: "jobs" };
  }
  const words = FIELD_WORDS[field];
  if (!words) return { text: `${who} edited it`, kind: "" };
  if (field === "note") return { text: `${who} ${str(d.to) ? "edited the note" : "cleared the note"}`, kind: words.kind };
  const to = shown(field, str(d.to), today);
  return { text: to ? `${who} set ${words.noun} to ${to}` : `${who} cleared ${words.noun}`, kind: words.kind };
}

/** One event as a line. `fromName` is the contractor's first name, for an email that came in under theirs. */
export function historyLine(e: HistoryEvent, today: Ymd, opts: { fromName?: string | null } = {}): HistoryLine {
  const d = asData(e.data);
  const who = firstName(e.actorLabel) || e.actorLabel || "Someone";
  const base = { id: e.id, createdAt: e.createdAt };
  switch (e.kind) {
    case "ARRIVED": {
      const source = (str(d.source) as InvoiceSource | null) ?? "STAFF";
      const text =
        source === "EMAIL"
          ? `${ARRIVED.EMAIL}${opts.fromName ? ` from ${opts.fromName}` : ""}`
          : `${who} ${ARRIVED[source] ?? ARRIVED.STAFF}`;
      return { ...base, text, kind: "", anchor: true };
    }
    case "EDITED": {
      const x = edited(who, d, today);
      return { ...base, text: x.text, kind: x.kind, anchor: false };
    }
    case "FILE_ADDED":
      return { ...base, text: str(d.filename) ? `${who} added ${d.filename as string}` : `${who} added a file`, kind: "", anchor: true };
    case "APPROVED":
      return { ...base, text: `${who} approved it`, kind: "", anchor: true };
    case "REOPENED":
      return { ...base, text: `${who} moved it back to To review`, kind: "", anchor: true };
    case "PAID":
      // The paid day and method are the paid line's, under the title.
      return { ...base, text: `${who} marked it paid`, kind: "", anchor: true };
    case "UNDONE":
      return { ...base, text: `${who} moved it back to To pay`, kind: "", anchor: true };
    case "NOT_INVOICE":
      return { ...base, text: `${who} marked it not an invoice`, kind: "", anchor: true };
    case "RESTORED":
      return { ...base, text: `${who} put it back in ${d.to === "TO_PAY" ? "To pay" : "To review"}`, kind: "", anchor: true };
  }
}
