import test from "node:test";
import assert from "node:assert/strict";
import { seedCategory, treatmentForCategory, type AccountInput } from "./categorize";

function acct(partial: Partial<AccountInput> & { name: string }): AccountInput {
  return {
    fullyQualifiedName: partial.fullyQualifiedName ?? partial.name,
    name: partial.name,
    acctType: partial.acctType ?? "Expense",
    acctSubType: partial.acctSubType ?? null,
    classification: partial.classification ?? "Expense",
  };
}

test("HG's real income accounts", () => {
  const rents = seedCategory(
    acct({ name: "Rents", fullyQualifiedName: "Business & Other Revenue:Rents", acctType: "Income", classification: "Revenue" }),
  );
  assert.equal(rents.category, "RENT");
  assert.equal(rents.treatment, "OPERATING_INCOME");

  const fees = seedCategory(
    acct({
      name: "Fees & Other Revenue",
      fullyQualifiedName: "Business & Other Revenue:Fees & Other Revenue",
      acctType: "Income",
      classification: "Revenue",
    }),
  );
  assert.equal(fees.category, "OTHER_INCOME");
  assert.equal(fees.treatment, "OPERATING_INCOME");
});

test("below-the-line accounts are pinned", () => {
  const suspense = seedCategory(
    acct({ name: "Suspense Receipts", acctType: "Other Income", classification: "Revenue" }),
  );
  assert.deepEqual(
    { c: suspense.category, t: suspense.treatment, locked: suspense.locked },
    { c: "SUSPENSE", t: "EXCLUDED", locked: true },
  );

  const interestIncome = seedCategory(
    acct({ name: "Interest income", acctType: "Other Income", classification: "Revenue" }),
  );
  assert.equal(interestIncome.category, "OTHER_INCOME");
  assert.equal(interestIncome.treatment, "NON_OPERATING");

  const interestExpense = seedCategory(
    acct({ name: "Interest expense", acctType: "Other Expense", classification: "Expense" }),
  );
  assert.deepEqual(
    { c: interestExpense.category, t: interestExpense.treatment, locked: interestExpense.locked },
    { c: "DEBT_INTEREST", t: "DEBT_INTEREST", locked: true },
  );

  const uncat = seedCategory(acct({ name: "Uncategorized Expense" }));
  assert.deepEqual(
    { c: uncat.category, t: uncat.treatment, locked: uncat.locked },
    { c: "UNCATEGORIZED", t: "OPERATING_EXPENSE", locked: true },
  );
});

test("HG's real operating-expense accounts", () => {
  const cases: [Partial<AccountInput> & { name: string }, string][] = [
    [{ name: "Electric", fullyQualifiedName: "Utilities:Electric" }, "UTILITIES"],
    [{ name: "GAS", fullyQualifiedName: "Utilities:GAS" }, "UTILITIES"],
    [{ name: "Water & Sewer", fullyQualifiedName: "Utilities:Water & Sewer" }, "UTILITIES"],
    [{ name: "Plumbing Repairs", fullyQualifiedName: "Other G&A:Repair Expense:Plumbing Repairs" }, "REPAIRS"],
    [{ name: "Cleaning & Maintenance", fullyQualifiedName: "Other G&A:Repair Expense:Cleaning & Maintenance" }, "REPAIRS"],
    [{ name: "City, State, & Local Taxes", fullyQualifiedName: "Other G&A:Taxes:City, State, & Local Taxes" }, "TAXES"],
    [{ name: "Business licenses", fullyQualifiedName: "Other G&A:Business licenses" }, "TAXES"],
    [{ name: "Insurance", fullyQualifiedName: "Insurance" }, "INSURANCE"],
    [{ name: "Insurance", fullyQualifiedName: "Other G&A:Insurance" }, "INSURANCE"],
    [{ name: "Legal & Professional Services" }, "LEGAL_PROFESSIONAL"],
    [{ name: "Leasing Commissions", fullyQualifiedName: "Other G&A:Commissions:Leasing Commissions" }, "LEASING_COMMISSION"],
    [{ name: "Software Subscriptions", fullyQualifiedName: "Other G&A:Software Subscriptions" }, "SOFTWARE"],
    [{ name: "Bank fees & service charges" }, "BANK_FEES"],
    [{ name: "Other operating expenses" }, "BANK_FEES"],
    [{ name: "General Operating Expenses", fullyQualifiedName: "Other G&A:General Operating Expenses" }, "OTHER_OPEX"],
    [{ name: "Travel" }, "TRAVEL"],
  ];
  for (const [a, expected] of cases) {
    const s = seedCategory(acct(a));
    assert.equal(s.category, expected, `${a.fullyQualifiedName ?? a.name} -> ${expected} (got ${s.category})`);
    assert.equal(s.treatment, "OPERATING_EXPENSE", `${a.name} treatment`);
  }
});

test("balance-sheet accounts are EXCLUDED", () => {
  for (const name of [
    "Mortgage Payments",
    "Security Deposits",
    "Short-term business loans",
    "Long-term business loans",
    "Owner Contribution",
    "Inter Co Payables",
  ]) {
    const s = seedCategory(acct({ name, classification: name.includes("Owner") ? "Equity" : "Liability" }));
    assert.equal(s.treatment, "EXCLUDED", name);
  }
});

test("heuristic fallbacks for accounts with no override", () => {
  // acctSubType wins
  assert.equal(seedCategory(acct({ name: "Anything", acctSubType: "Utilities" })).category, "UTILITIES");
  assert.equal(seedCategory(acct({ name: "Anything", acctSubType: "InterestPaid" })).category, "DEBT_INTEREST");
  // name regex
  assert.equal(seedCategory(acct({ name: "Landscaping - front yard" })).category, "REPAIRS");
  assert.equal(seedCategory(acct({ name: "Property Management Fee" })).category, "MANAGEMENT");
  // acctType fallback
  assert.equal(seedCategory(acct({ name: "Misc Junk", acctType: "Expense" })).category, "OTHER_OPEX");
  assert.equal(
    seedCategory(acct({ name: "Some Asset", acctType: "Bank", classification: "Asset" })).category,
    "EXCLUDED",
  );
});

test("treatmentForCategory sanity", () => {
  assert.equal(treatmentForCategory("RENT", "Revenue"), "OPERATING_INCOME");
  assert.equal(treatmentForCategory("DEBT_INTEREST", "Expense"), "DEBT_INTEREST");
  assert.equal(treatmentForCategory("SUSPENSE", "Revenue"), "EXCLUDED");
  assert.equal(treatmentForCategory("UTILITIES", "Expense"), "OPERATING_EXPENSE");
  assert.equal(treatmentForCategory("OTHER", "Revenue"), "OPERATING_INCOME");
  assert.equal(treatmentForCategory("OTHER", "Asset"), "EXCLUDED");
});
