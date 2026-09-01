import {
  toCents,
  UNCLASSED,
  type PnlByClassCell,
  type PnlSection,
  type RawDetailLine,
} from "./types";

/**
 * Parsers for the two QuickBooks report shapes we consume. Pure; covered by
 * report-parse.test.ts against fixtures.
 *
 * ⚠️ Phase 0: replace the synthetic fixtures with real captured JSON from the
 * Intuit sandbox and confirm — the amount column (`subt_nat_amount` vs `_home`
 * vs `_nt`), the sign convention (this code assumes **income +, expense +,
 * contra −** and asserts each section ties to its Summary), and that
 * `klass_name` / `tx_date` cells carry ids.
 */

export class QboReportShapeError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "QboReportShapeError";
  }
}

// --- shared helpers --------------------------------------------------------

interface QboColumn {
  ColTitle?: string;
  ColType?: string;
  MetaData?: { Name: string; Value: string }[];
}
interface QboColData {
  value?: string;
  id?: string;
}
interface QboRow {
  type?: string; // "Data" | "Section"
  group?: string; // Income | COGS | Expenses | OtherIncome | OtherExpenses | GrossProfit | ...
  Header?: { ColData?: QboColData[] };
  Rows?: { Row?: QboRow[] };
  Summary?: { ColData?: QboColData[] };
  ColData?: QboColData[];
}
interface QboReportJson {
  Header?: { StartPeriod?: string; EndPeriod?: string; Option?: { Name: string; Value: string }[] };
  Columns?: { Column?: QboColumn[] };
  Rows?: { Row?: QboRow[] };
}

function colKey(c: QboColumn): string | undefined {
  return c.MetaData?.find((m) => m.Name === "ColKey")?.Value;
}

/** `group` values — used by the plain/by-class ProfitAndLoss report (confirmed live: it sets `group` on flat top-level rows). */
const SECTION_GROUPS: Record<string, PnlSection> = {
  Income: "Income",
  COGS: "COGS",
  Expenses: "Expenses",
  OtherIncome: "OtherIncome",
  OtherExpenses: "OtherExpenses",
};
/** Summary-only sections — no transaction rows of their own; we re-sum leaves. */
const SKIP_GROUPS = new Set(["GrossProfit", "NetOperatingIncome", "NetOtherIncome", "NetIncome"]);

/**
 * Header text — used by ProfitAndLossDetail instead (confirmed live: it never
 * sets `group` on any row; sections are only identifiable by name, one level
 * under an unnamed wrapper — see the comment at its call site below).
 */
const SECTION_NAMES: Record<string, PnlSection> = {
  Income: "Income",
  "Cost of Goods Sold": "COGS",
  Expenses: "Expenses",
  "Other Income": "OtherIncome",
  "Other Expense": "OtherExpenses",
  "Other Expenses": "OtherExpenses", // seen written either way live
};

// --- ProfitAndLossDetail -> RawDetailLine[] -------------------------------

/**
 * The `columns` we request. `account_name` is deliberately excluded from the
 * required set below (and can be dropped from the request entirely) —
 * confirmed live that QBO doesn't support it as a flat column on this report;
 * account name always comes from the section header instead. Requiring it
 * here would be a false-positive shape failure on every sync.
 */
export const PNL_DETAIL_COLUMNS = [
  "tx_date",
  "txn_type",
  "doc_num",
  "name",
  "memo",
  "split_acc",
  "klass_name",
  "subt_nat_amount",
] as const;

export function assertColumnsPresent(input: unknown): void {
  const json = input as QboReportJson;
  const returned = new Set((json.Columns?.Column ?? []).map(colKey).filter(Boolean));
  const missing = PNL_DETAIL_COLUMNS.filter((k) => !returned.has(k));
  if (missing.length) {
    throw new QboReportShapeError(
      `ProfitAndLossDetail dropped columns: ${missing.join(", ")} — QBO silently omits unsupported keys`,
      { returned: [...returned] },
    );
  }
}

export function parseProfitAndLossDetail(
  input: unknown,
  periodMonth: string,
  basis: "CASH" | "ACCRUAL",
): RawDetailLine[] {
  const json = input as QboReportJson;
  assertColumnsPresent(json);

  const cols = json.Columns?.Column ?? [];
  const idxOf = (key: string) => cols.findIndex((c) => colKey(c) === key);
  const iDate = idxOf("tx_date");
  const iType = idxOf("txn_type");
  const iDoc = idxOf("doc_num");
  const iName = idxOf("name");
  const iMemo = idxOf("memo");
  const iAcct = idxOf("account_name");
  const iSplit = idxOf("split_acc");
  const iClass = idxOf("klass_name");
  const iAmt = idxOf("subt_nat_amount");

  const out: RawDetailLine[] = [];
  const sectionTotals = new Map<PnlSection, number>();

  const walk = (row: QboRow, section: PnlSection, acctHeader: { name: string; id: string | null }) => {
    // an account sub-section: its Header names the account
    let header = acctHeader;
    if ((row.type === "Section" || row.Rows) && row.Header?.ColData?.[0]?.value) {
      header = { name: row.Header.ColData[0].value, id: row.Header.ColData[0].id ?? null };
    }

    for (const child of row.Rows?.Row ?? []) {
      if (child.type === "Data") {
        const cd = child.ColData ?? [];
        const cell = (i: number): QboColData => (i >= 0 ? (cd[i] ?? {}) : {});
        const acctCell = cell(iAcct);
        const classCell = cell(iClass);
        const nameCell = cell(iName);
        const amountCents = toCents(cell(iAmt).value);
        const accountName = acctCell.value || header.name;
        const txnDate = cell(iDate).value ?? `${periodMonth}-01`;

        out.push({
          txnDate,
          periodMonth,
          txnType: cell(iType).value ?? "",
          qboTxnId: cell(iDate).id ?? null,
          docNumber: cell(iDoc).value || null,
          name: nameCell.value || null,
          memo: cell(iMemo).value || null,
          businessName: null, // Department column is fetched separately when needed
          accountQboId: acctCell.id ?? header.id,
          accountName,
          splitAccount: cell(iSplit).value || null,
          // `||` not `??`: an unclassed line's cell is `{value:"",id:""}` —
          // present but empty, not absent — confirmed live against the
          // sandbox. `??` doesn't catch that, which silently left `classKey`
          // as `""` instead of the UNCLASSED sentinel and broke the by-class
          // reconciliation cross-check for every unclassed dollar.
          classQboId: classCell.id || null,
          className: classCell.value || null,
          amountCents,
          section,
        });
        sectionTotals.set(section, (sectionTotals.get(section) ?? 0) + amountCents);
      } else if (child.type === "Section" || child.Rows) {
        walk(child, section, header);
      }
    }
  };

  // Unlike the plain/by-class ProfitAndLoss report, ProfitAndLossDetail never
  // sets `group` on any row — confirmed live against the sandbox. Instead the
  // whole report is wrapped in one or two unnamed-to-us containers
  // ("Ordinary Income/Expenses", "Other Income/Expense"), each holding the
  // real sections (Income / Cost of Goods Sold / Expenses / Other Income /
  // Other Expense) as its direct children, identified only by their Header
  // text. A bare trailing "Net Income" total (no Header at all) can also
  // appear as its own top-level sibling. So: for every top-level row, look
  // one level down and match children by name; anything unnamed or
  // unrecognized (the wrapper itself, "Gross Profit", the trailing total) is
  // silently skipped rather than walked, since it carries no lines of its
  // own beyond what its named children already contribute.
  for (const top of json.Rows?.Row ?? []) {
    for (const child of top.Rows?.Row ?? []) {
      const name = child.Header?.ColData?.[0]?.value;
      const section = name ? SECTION_NAMES[name] : undefined;
      if (!section) continue;
      walk(child, section, { name: "", id: null });

      // Assert the parsed lines tie to this section's Summary — catches a
      // sign convention surprise, a dropped row, or the wrong amount column.
      const summaryCell = child.Summary?.ColData;
      if (summaryCell?.length) {
        const reported =
          toCents(summaryCell[iAmt]?.value) || toCents(summaryCell[summaryCell.length - 1]?.value);
        const parsed = sectionTotals.get(section) ?? 0;
        if (reported !== 0 && Math.abs(parsed - reported) > 1) {
          throw new QboReportShapeError(
            `ProfitAndLossDetail section "${name}" line-sum ${parsed}¢ ≠ Summary ${reported}¢ ` +
              `(basis ${basis}, ${periodMonth}) — check the amount column / sign convention`,
            { parsed, reported },
          );
        }
      }
    }
  }

  return out;
}

// --- ProfitAndLoss (summarize_column_by=Classes) -> cells ----------------

export function parseProfitAndLossByClass(input: unknown): PnlByClassCell[] {
  const json = input as QboReportJson;
  const cols = json.Columns?.Column ?? [];
  const classCols: { idx: number; classId: string | null; title: string }[] = [];
  cols.forEach((c, idx) => {
    if (c.ColType !== "Money") return;
    const key = colKey(c);
    if (key === "total" || key === "grand_total") return;
    classCols.push({
      idx,
      // Intuit's real ColKey for the unclassed bucket is "not_specified"
      // (snake_case) — confirmed live against the sandbox, not the
      // "NotSpecified" this originally assumed. Without an exact match here
      // that whole column gets treated as a literal class id, so every
      // unclassed dollar silently fails the by-class reconciliation tie-out.
      classId: key && key !== "not_specified" && key !== "" ? key : null,
      title: c.ColTitle || "Not Specified",
    });
  });
  if (classCols.length === 0) {
    throw new QboReportShapeError("ProfitAndLoss-by-Class returned no class columns");
  }

  const out: PnlByClassCell[] = [];

  const emitCell = (cd: QboColData[], section: PnlSection) => {
    const accountName = cd[0]?.value ?? "";
    const accountQboId = cd[0]?.id ?? null;
    for (const c of classCols) {
      const cents = toCents(cd[c.idx]?.value);
      if (cents === 0) continue;
      out.push({
        accountQboId,
        accountName,
        classQboId: c.classId,
        className: c.title,
        section,
        amountCents: cents,
      });
    }
  };

  const walk = (row: QboRow, section: PnlSection) => {
    for (const child of row.Rows?.Row ?? []) {
      if (child.type === "Data" && child.ColData?.length) {
        emitCell(child.ColData, section);
      } else if (child.type === "Section" || child.Rows) {
        // A parent account with sub-accounts (e.g. "Landscaping Services"
        // over "Job Materials"/"Labor") can carry its own direct-posted
        // amount right on ITS OWN Header.ColData, alongside its name —
        // confirmed live: the parent's total only ties out once that's
        // added to its children's sum. A real account's Header carries an
        // `id`; a pure category label ("Income", "Expenses", ...) never
        // does, so this can't double-count those.
        const hd = child.Header?.ColData;
        if (hd?.length && hd[0]?.id) emitCell(hd, section);
        walk(child, section);
      }
    }
  };

  for (const top of json.Rows?.Row ?? []) {
    const group = top.group ?? "";
    if (SKIP_GROUPS.has(group)) continue;
    const section = SECTION_GROUPS[group];
    if (!section) continue;
    walk(top, section);
  }

  return out;
}

/** classQboId or the UNCLASSED sentinel — for LedgerLine.classKey. */
export function classKeyOf(classQboId: string | null): string {
  return classQboId ?? UNCLASSED;
}

// --- plain ProfitAndLoss (no summarize) — the reconciliation anchors --------

function lastNumericCell(cells: QboColData[] | undefined): number | null {
  if (!cells) return null;
  for (let i = cells.length - 1; i >= 0; i--) {
    const v = cells[i]?.value;
    if (v != null && v !== "" && /^-?[\d,]*\.?\d+$/.test(v.trim())) return toCents(v);
  }
  return null;
}

export interface PlainPnl {
  netIncomeCents: number | null;
  netOperatingIncomeCents: number | null;
  totalIncomeCents: number | null;
  totalExpenseCents: number | null;
}

export function parsePlainProfitAndLoss(input: unknown): PlainPnl {
  const json = input as QboReportJson;
  const out: PlainPnl = {
    netIncomeCents: null,
    netOperatingIncomeCents: null,
    totalIncomeCents: null,
    totalExpenseCents: null,
  };
  for (const top of json.Rows?.Row ?? []) {
    const amt = lastNumericCell(top.Summary?.ColData);
    switch (top.group) {
      case "NetIncome":
        out.netIncomeCents = amt;
        break;
      case "NetOperatingIncome":
        out.netOperatingIncomeCents = amt;
        break;
      case "Income":
        out.totalIncomeCents = amt;
        break;
      case "Expenses":
        out.totalExpenseCents = amt;
        break;
    }
  }
  return out;
}
