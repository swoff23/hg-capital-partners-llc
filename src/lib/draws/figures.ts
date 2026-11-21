import { toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";

/**
 * The rehab draw figures (docs/specs/rehab-draws.md, section 4): per line,
 * per rehab and across every open rehab. Nothing here is stored; the pages
 * and Home compute them from the lines and draws on each read. Pure, and
 * counted in cents so a column of $1,500.45s adds up exactly.
 */

export type DrawStage = "DRAFT" | "SENT" | "INSPECTION" | "APPROVED" | "FUNDED";

export const STAGES: readonly DrawStage[] = ["DRAFT", "SENT", "INSPECTION", "APPROVED", "FUNDED"];

export const STAGE_LABEL: Record<DrawStage, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  INSPECTION: "Inspection",
  APPROVED: "Approved",
  FUNDED: "Funded",
};

/** The stages where a draw is with the lender: asked for, not yet in the bank. */
export const AT_LENDER: readonly DrawStage[] = ["SENT", "INSPECTION", "APPROVED"];

/** The stage a draw moves to next, one step at a time (Connor, Nov 20: "easier to adjust the status ... from stage to stage"). */
export const NEXT_STAGE: Partial<Record<DrawStage, DrawStage>> = { SENT: "INSPECTION", INSPECTION: "APPROVED", APPROVED: "FUNDED" };

/** The next-step button's words for a draw in each stage. */
export const NEXT_STEP_LABEL: Partial<Record<DrawStage, string>> = { SENT: "Mark inspection", INSPECTION: "Mark approved", APPROVED: "Mark funded" };

/** A draw that hasn't moved in this many days earns a Needs you row (R11). */
export const STUCK_DAYS = 10;

export function atLender(stage: DrawStage): boolean {
  return AT_LENDER.includes(stage);
}

export interface LineIn {
  id: string;
  position: number;
  /** The property unit's lasting id, or null (a plain list, or a worksheet unit not matched to one). */
  unitId: string | null;
  /** The unit as the page names it: the property unit's label ("765 Prospect Avenue · Upper" on a rehab over two properties), or the worksheet's. */
  unitLabel: string | null;
  name: string;
  original: number;
  changeOrder: number;
}

export interface DrawIn {
  id: string;
  number: number;
  stage: DrawStage;
  stageChangedAt: Date | string;
  sentOn: Date | string | null;
  sentAmount: number | null;
  approvedOn: Date | string | null;
  approvedAmount: number | null;
  fundedOn: Date | string | null;
  fundedAmount: number | null;
  lines: { lineId: string; amount: number }[];
}

export interface LineFigures extends LineIn {
  revised: number;
  funded: number;
  atLender: number;
  draft: number;
  /**
   * What the line can still be drawn on: revised less funded and submitted (Connor, Nov 20: the number Pieter
   * looks at when it's time for a draw). The draw being built counts against it only when it's sent.
   */
  available: number;
  /** Revised less funded, at the lender and draft. Below zero when the line is over. */
  left: number;
  /** How far past its revised budget the line goes; 0 when it isn't over. */
  over: number;
}

const cents = (n: number | null | undefined): number => Math.round((n ?? 0) * 100);
const dollars = (c: number): number => c / 100;

/** Each line's figures, in the lines' own order (position). */
export function lineFigures(lines: readonly LineIn[], draws: readonly DrawIn[]): LineFigures[] {
  const by = new Map<string, { funded: number; atLender: number; draft: number }>();
  for (const l of lines) by.set(l.id, { funded: 0, atLender: 0, draft: 0 });
  for (const d of draws) {
    const bucket = d.stage === "FUNDED" ? "funded" : d.stage === "DRAFT" ? "draft" : "atLender";
    for (const a of d.lines) {
      const row = by.get(a.lineId);
      if (row) row[bucket] += cents(a.amount);
    }
  }
  return [...lines]
    .sort((a, b) => a.position - b.position)
    .map((l) => {
      const row = by.get(l.id)!;
      const revised = cents(l.original) + cents(l.changeOrder);
      const left = revised - row.funded - row.atLender - row.draft;
      return {
        ...l,
        revised: dollars(revised),
        funded: dollars(row.funded),
        atLender: dollars(row.atLender),
        draft: dollars(row.draft),
        available: dollars(revised - row.funded - row.atLender),
        left: dollars(left),
        over: dollars(Math.max(0, -left)),
      };
    });
}

export interface UnitGroup {
  /** The unit's id, or null for a worksheet unit or no split. */
  unitId: string | null;
  /** "Upper", "Unit 1", or null for a budget with no split. */
  unitLabel: string | null;
  lines: LineFigures[];
  revised: number;
  left: number;
}

/**
 * The lines grouped by unit, in the order the units first appear (R8). A
 * budget with no unit split comes back as one group with a null label, which
 * the page shows as a plain list.
 */
export function unitGroups(lines: readonly LineFigures[]): UnitGroup[] {
  const groups = new Map<string, UnitGroup>();
  for (const l of lines) {
    // By the unit itself, so two properties' "Upper" stay apart; a worksheet's own unit by its words.
    const key = l.unitId ? `id:${l.unitId}` : l.unitLabel ? `label:${l.unitLabel}` : "";
    let g = groups.get(key);
    if (!g) {
      g = { unitId: l.unitId, unitLabel: l.unitLabel, lines: [], revised: 0, left: 0 };
      groups.set(key, g);
    }
    g.lines.push(l);
  }
  for (const g of groups.values()) {
    g.revised = dollars(g.lines.reduce((s, l) => s + cents(l.revised), 0));
    g.left = dollars(g.lines.reduce((s, l) => s + cents(l.left), 0));
  }
  return [...groups.values()];
}

/** What a draw is worth to the lender: approved once known, else what was sent, else its lines. */
export function drawAmount(d: Pick<DrawIn, "approvedAmount" | "sentAmount" | "lines">): number {
  if (d.approvedAmount != null) return d.approvedAmount;
  if (d.sentAmount != null) return d.sentAmount;
  return linesTotal(d.lines);
}

export function linesTotal(lines: readonly { amount: number }[]): number {
  return dollars(lines.reduce((s, a) => s + cents(a.amount), 0));
}

/** The lender's fee on a funded draw: approved less what landed. Null until both are known. */
export function drawFee(d: Pick<DrawIn, "approvedAmount" | "fundedAmount">): number | null {
  if (d.approvedAmount == null || d.fundedAmount == null) return null;
  return dollars(cents(d.approvedAmount) - cents(d.fundedAmount));
}

export interface RehabFigures {
  /** The lender's holdback, or the lines' original total when none was entered. */
  holdback: number;
  revised: number;
  funded: number;
  /** Draws with the lender, at what they're worth to it (drawAmount). */
  atLender: number;
  /** The draw being built: its total. */
  ready: number;
  /** What the rehab can still be drawn on: revised less funded and submitted. */
  available: number;
  left: number;
  /** Revised less funded: the money the loan still holds back. */
  undrawn: number;
  /** Revised less the lender's holdback; null when no holdback was entered. */
  holdbackGap: number | null;
  /** The revised total no longer matches the lender's holdback, which a lender won't raise. */
  offHoldback: boolean;
}

export function rehabFigures(holdback: number | null, lines: readonly LineFigures[], draws: readonly DrawIn[]): RehabFigures {
  const sum = (pick: (l: LineFigures) => number) => lines.reduce((s, l) => s + cents(pick(l)), 0);
  const original = sum((l) => l.original);
  const revised = sum((l) => l.revised);
  const funded = sum((l) => l.funded);
  const atLenderC = draws.filter((d) => atLender(d.stage)).reduce((s, d) => s + cents(drawAmount(d)), 0);
  const ready = sum((l) => l.draft);
  const hold = holdback != null ? cents(holdback) : original;
  const gap = holdback != null && lines.length > 0 ? revised - hold : null;
  return {
    holdback: dollars(hold),
    revised: dollars(revised),
    funded: dollars(funded),
    atLender: dollars(atLenderC),
    ready: dollars(ready),
    available: dollars(sum((l) => l.available)),
    left: dollars(sum((l) => l.left)),
    undrawn: dollars(revised - funded),
    holdbackGap: gap == null ? null : dollars(gap),
    offHoldback: gap != null && gap !== 0,
  };
}

/** The draft, if one is open. The database allows one per rehab. */
export function openDraft<D extends Pick<DrawIn, "stage">>(draws: readonly D[]): D | null {
  return draws.find((d) => d.stage === "DRAFT") ?? null;
}

/** The draw with the lender that's been there longest (lowest number), or null. */
export function currentDraw<D extends Pick<DrawIn, "stage" | "number">>(draws: readonly D[]): D | null {
  return [...draws].filter((d) => atLender(d.stage)).sort((a, b) => a.number - b.number)[0] ?? null;
}

/** The next draw's number. */
export function nextNumber(draws: readonly Pick<DrawIn, "number">[]): number {
  return draws.reduce((m, d) => Math.max(m, d.number), 0) + 1;
}

/** Whole days since the draw last moved, counted in Buffalo days. */
export function daysInStage(d: Pick<DrawIn, "stageChangedAt">, today: Ymd = todayYmdEastern()): number {
  const moved = todayYmdEastern(new Date(d.stageChangedAt));
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(moved)) / 86_400_000));
}

/** A draw with the lender that hasn't moved in STUCK_DAYS. */
export function isStuck(d: Pick<DrawIn, "stage" | "stageChangedAt">, today: Ymd = todayYmdEastern()): boolean {
  return atLender(d.stage) && daysInStage(d, today) >= STUCK_DAYS;
}

/** "6 days", "1 day", "Today". */
export function daysLabel(days: number): string {
  if (days <= 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * The current draw's cell on Draws and the property page: "Draw 4 · Inspection · 6 days",
 * or null with nothing submitted.
 */
export function drawLine(d: Pick<DrawIn, "number" | "stage" | "stageChangedAt"> | null, today: Ymd = todayYmdEastern()): string | null {
  if (!d) return null;
  return `Draw ${d.number} · ${STAGE_LABEL[d.stage]} · ${daysLabel(daysInStage(d, today))}`;
}

export interface PortfolioDraws {
  available: number;
  atLender: number;
  funded: number;
}

/** The Draws page's strip: every open rehab added up (L1): available, submitted, funded. */
export function portfolioDraws(rehabs: readonly RehabFigures[]): PortfolioDraws {
  const add = (pick: (r: RehabFigures) => number) => dollars(rehabs.reduce((s, r) => s + cents(pick(r)), 0));
  return { available: add((r) => r.available), atLender: add((r) => r.atLender), funded: add((r) => r.funded) };
}

/** One draw's take on a line, for the line's history: "Draw 1 · $8,000". */
export interface LineDraw {
  number: number;
  stage: DrawStage;
  amount: number;
}

/**
 * What each sent draw took from one line, oldest first (Connor, Nov 20: "associating the work that was done with
 * previous draws, so Peter realizes ... he can't pull from that again"). The draw being built isn't in it.
 */
export function lineHistory(lineId: string, draws: readonly Pick<DrawIn, "number" | "stage" | "lines">[]): LineDraw[] {
  return draws
    .filter((d) => d.stage !== "DRAFT")
    .flatMap((d) => d.lines.filter((a) => a.lineId === lineId && a.amount !== 0).map((a) => ({ number: d.number, stage: d.stage, amount: a.amount })))
    .sort((a, b) => a.number - b.number);
}

/** A calendar day as the draw records it, for the forms: "2026-10-22", or null. */
export function dayOf(v: Date | string | null | undefined): Ymd | null {
  return toYmd(v);
}
