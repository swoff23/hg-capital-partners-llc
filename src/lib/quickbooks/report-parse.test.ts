import test from "node:test";
import assert from "node:assert/strict";
import {
  assertColumnsPresent,
  parseProfitAndLossByClass,
  parseProfitAndLossDetail,
  QboReportShapeError,
  PNL_DETAIL_COLUMNS,
} from "./report-parse";

/**
 * Synthetic fixtures shaped to Intuit's documented ProfitAndLoss(Detail) JSON.
 * ⚠️ Phase 0 swaps these for real captured sandbox JSON and re-runs this file.
 */

const DETAIL_COLUMNS = PNL_DETAIL_COLUMNS.map((k) => ({
  ColType: k === "subt_nat_amount" ? "Money" : "String",
  MetaData: [{ Name: "ColKey", Value: k }],
}));

function dataRow(cells: Record<string, { value: string; id?: string }>) {
  return {
    type: "Data",
    ColData: PNL_DETAIL_COLUMNS.map((k) => cells[k] ?? { value: "" }),
  };
}

function detailFixture() {
  return {
    Header: { StartPeriod: "2026-03-01", EndPeriod: "2026-03-31" },
    Columns: { Column: DETAIL_COLUMNS },
    Rows: {
      Row: [
        {
          type: "Section",
          group: "Income",
          Header: { ColData: [{ value: "Income" }] },
          Rows: {
            Row: [
              {
                type: "Section",
                Header: { ColData: [{ value: "Rents", id: "84" }] },
                Rows: {
                  Row: [
                    dataRow({
                      tx_date: { value: "2026-03-04", id: "txn-1" },
                      txn_type: { value: "Deposit" },
                      name: { value: "Baselane" },
                      memo: { value: "Baselane | Rent#a" },
                      account_name: { value: "Rents", id: "84" },
                      klass_name: { value: "HGC:HGC 118 Congress", id: "cls-congress" },
                      subt_nat_amount: { value: "1500.00" },
                    }),
                    dataRow({
                      tx_date: { value: "2026-03-06", id: "txn-2" },
                      txn_type: { value: "Deposit" },
                      name: { value: "Baselane" },
                      account_name: { value: "Rents", id: "84" },
                      klass_name: { value: "HG2:HG2 15 Oxford", id: "cls-oxford" },
                      subt_nat_amount: { value: "2400.00" },
                    }),
                    dataRow({
                      tx_date: { value: "2026-03-09", id: "txn-3" },
                      txn_type: { value: "Deposit" },
                      name: { value: "Wasteaway" },
                      account_name: { value: "Rents", id: "84" },
                      klass_name: { value: "" }, // no class -> "Not Specified"
                      subt_nat_amount: { value: "100.00" },
                    }),
                  ],
                },
                Summary: { ColData: [{ value: "Total for Rents" }] },
              },
            ],
          },
          Summary: {
            ColData: PNL_DETAIL_COLUMNS.map((k) =>
              k === "subt_nat_amount" ? { value: "4000.00" } : { value: "" },
            ),
          },
        },
        {
          type: "Section",
          group: "Expenses",
          Header: { ColData: [{ value: "Expenses" }] },
          Rows: {
            Row: [
              {
                type: "Section",
                Header: { ColData: [{ value: "Utilities", id: "90" }] },
                Rows: {
                  Row: [
                    {
                      type: "Section",
                      Header: { ColData: [{ value: "Electric", id: "91" }] },
                      Rows: {
                        Row: [
                          dataRow({
                            tx_date: { value: "2026-03-11", id: "txn-4" },
                            txn_type: { value: "Expense" },
                            name: { value: "NGRID36" },
                            account_name: { value: "Electric", id: "91" },
                            klass_name: { value: "HGC:HGC 118 Congress", id: "cls-congress" },
                            subt_nat_amount: { value: "220.00" },
                          }),
                        ],
                      },
                      Summary: { ColData: [{ value: "Total for Electric" }] },
                    },
                  ],
                },
                Summary: { ColData: [{ value: "Total for Utilities" }] },
              },
              dataRow({
                tx_date: { value: "2026-03-20", id: "txn-5" },
                txn_type: { value: "Journal Entry" },
                account_name: { value: "General Operating Expenses", id: "78" },
                klass_name: { value: "HGC:HGC 933 Lafayette", id: "cls-laf" },
                subt_nat_amount: { value: "-50.00" }, // a contra / reclass
              }),
            ],
          },
          Summary: {
            ColData: PNL_DETAIL_COLUMNS.map((k) =>
              k === "subt_nat_amount" ? { value: "170.00" } : { value: "" },
            ),
          },
        },
        {
          type: "Section",
          group: "OtherIncome",
          Header: { ColData: [{ value: "Other Income" }] },
          Rows: {
            Row: [
              dataRow({
                tx_date: { value: "2026-03-26", id: "txn-6" },
                txn_type: { value: "Deposit" },
                name: { value: "Puleo Delisle" },
                memo: { value: "Wire — 15 Oxford closing" },
                account_name: { value: "Suspense Receipts", id: "200" },
                klass_name: { value: "HG2:HG2 15 Oxford", id: "cls-oxford" },
                subt_nat_amount: { value: "47934.33" },
              }),
            ],
          },
          Summary: {
            ColData: PNL_DETAIL_COLUMNS.map((k) =>
              k === "subt_nat_amount" ? { value: "47934.33" } : { value: "" },
            ),
          },
        },
        // summary-only section — must be skipped
        {
          type: "Section",
          group: "NetIncome",
          Summary: { ColData: [{ value: "Net Income" }, { value: "51764.33" }] },
        },
      ],
    },
  };
}

test("assertColumnsPresent throws when QBO silently drops a column", () => {
  const j = detailFixture();
  j.Columns.Column = j.Columns.Column.filter(
    (c) => c.MetaData[0].Value !== "klass_name",
  );
  assert.throws(() => assertColumnsPresent(j), QboReportShapeError);
});

test("parseProfitAndLossDetail extracts lines with class ids, sections, cents", () => {
  const lines = parseProfitAndLossDetail(detailFixture(), "2026-03", "CASH");
  assert.equal(lines.length, 6); // 3 rent + electric + reclass + suspense

  const congressRent = lines.find((l) => l.qboTxnId === "txn-1")!;
  assert.equal(congressRent.section, "Income");
  assert.equal(congressRent.classQboId, "cls-congress");
  assert.equal(congressRent.className, "HGC:HGC 118 Congress");
  assert.equal(congressRent.accountQboId, "84");
  assert.equal(congressRent.amountCents, 150_000);
  assert.equal(congressRent.periodMonth, "2026-03");

  const noClass = lines.find((l) => l.qboTxnId === "txn-3")!;
  assert.equal(noClass.classQboId, null);

  const electric = lines.find((l) => l.qboTxnId === "txn-4")!;
  assert.equal(electric.section, "Expenses");
  assert.equal(electric.accountName, "Electric");
  assert.equal(electric.amountCents, 22_000);

  const reclass = lines.find((l) => l.qboTxnId === "txn-5")!;
  assert.equal(reclass.amountCents, -5_000, "negative contra preserved");

  const suspense = lines.find((l) => l.qboTxnId === "txn-6")!;
  assert.equal(suspense.section, "OtherIncome");
  assert.equal(suspense.amountCents, 4_793_433);

  // the NetIncome summary-only section produced nothing
  assert.equal(lines.filter((l) => l.section === ("NetIncome" as never)).length, 0);
});

test("parseProfitAndLossDetail throws when a section's lines don't tie to its Summary", () => {
  const j = detailFixture();
  // break the Income Summary: claim 9999.00 vs the real 4000.00
  j.Rows.Row[0].Summary = {
    ColData: PNL_DETAIL_COLUMNS.map((k) =>
      k === "subt_nat_amount" ? { value: "9999.00" } : { value: "" },
    ),
  };
  assert.throws(() => parseProfitAndLossDetail(j, "2026-03", "CASH"), QboReportShapeError);
});

// --- by-class summary ----------------------------------------------------

function byClassFixture() {
  return {
    Columns: {
      Column: [
        { ColTitle: "", ColType: "Account", MetaData: [{ Name: "ColKey", Value: "account" }] },
        { ColTitle: "HGC 118 Congress", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "cls-congress" }] },
        { ColTitle: "HG2 15 Oxford", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "cls-oxford" }] },
        { ColTitle: "Not Specified", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "NotSpecified" }] },
        { ColTitle: "TOTAL", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "total" }] },
      ],
    },
    Rows: {
      Row: [
        {
          type: "Section",
          group: "Income",
          Rows: {
            Row: [
              {
                type: "Data",
                ColData: [
                  { value: "Rents", id: "84" },
                  { value: "1500.00" },
                  { value: "2400.00" },
                  { value: "100.00" },
                  { value: "4000.00" },
                ],
              },
            ],
          },
        },
        {
          type: "Section",
          group: "Expenses",
          Rows: {
            Row: [
              {
                type: "Data",
                ColData: [
                  { value: "Electric", id: "91" },
                  { value: "220.00" },
                  { value: "" },
                  { value: "" },
                  { value: "220.00" },
                ],
              },
            ],
          },
        },
        { type: "Section", group: "NetIncome", Summary: { ColData: [{ value: "Net Income" }] } },
      ],
    },
  };
}

test("parseProfitAndLossByClass yields per-(account,class) cells; NotSpecified -> null", () => {
  const cells = parseProfitAndLossByClass(byClassFixture());
  assert.equal(cells.length, 4); // 3 rent cells + 1 electric cell (empty cells skipped)

  const rentOxford = cells.find((c) => c.accountName === "Rents" && c.classQboId === "cls-oxford")!;
  assert.equal(rentOxford.amountCents, 240_000);
  assert.equal(rentOxford.section, "Income");

  const rentUnclassed = cells.find((c) => c.accountName === "Rents" && c.classQboId === null)!;
  assert.equal(rentUnclassed.amountCents, 10_000);
  assert.equal(rentUnclassed.className, "Not Specified");

  const electric = cells.find((c) => c.accountName === "Electric")!;
  assert.equal(electric.classQboId, "cls-congress");
  assert.equal(electric.section, "Expenses");
});

test("parseProfitAndLossByClass throws when there are no class columns", () => {
  const j = byClassFixture();
  j.Columns.Column = [j.Columns.Column[0], j.Columns.Column[4]]; // account + total only
  assert.throws(() => parseProfitAndLossByClass(j), QboReportShapeError);
});
