import type { QboCategory, QboTreatment } from "@prisma/client";

/**
 * Account -> category/treatment. Pure; covered by categorize.test.ts against
 * HG's real chart of accounts.
 *
 *   category  = the human-facing bucket (drives the expense-by-category bars)
 *   treatment = the coarse bucket the NOI math groups by
 *
 * Order: explicit per-account override -> Intuit acctSubType -> name regex ->
 * acctType fallback.
 */

export interface AccountInput {
  fullyQualifiedName: string; // "Other G&A:Repair Expense:Plumbing Repairs"
  name: string; // "Plumbing Repairs"
  acctType: string; // Intuit AccountType   ("Expense", "Other Income", …)
  acctSubType: string | null; // Intuit AccountSubType ("Insurance", "Utilities", …)
  classification: string | null; // "Revenue" | "Expense" | "Asset" | "Liability" | "Equity"
}

export interface Seeded {
  category: QboCategory;
  treatment: QboTreatment;
  /** Pin so the nightly re-seed can't stomp it. */
  locked: boolean;
  source: "override" | "subtype" | "regex" | "accttype";
}

// --- treatment ---------------------------------------------------------------

export function treatmentForCategory(
  category: QboCategory,
  classification: string | null,
): QboTreatment {
  switch (category) {
    case "RENT":
      return "OPERATING_INCOME";
    case "OTHER_INCOME":
      return "OPERATING_INCOME"; // bank interest is forced NON_OPERATING via override
    case "DEBT_INTEREST":
      return "DEBT_INTEREST";
    case "SUSPENSE":
    case "CAPEX":
    case "INTERCOMPANY":
    case "OWNER_EQUITY":
    case "EXCLUDED":
      return "EXCLUDED";
    case "TAXES":
    case "INSURANCE":
    case "REPAIRS":
    case "UTILITIES":
    case "MANAGEMENT":
    case "LEGAL_PROFESSIONAL":
    case "LEASING_COMMISSION":
    case "BANK_FEES":
    case "SOFTWARE":
    case "TRAVEL":
    case "OTHER_OPEX":
    case "UNCATEGORIZED":
      return "OPERATING_EXPENSE";
    default:
      if (classification === "Revenue") return "OPERATING_INCOME";
      if (classification === "Expense") return "OPERATING_EXPENSE";
      return "EXCLUDED";
  }
}

const CATEGORIES_LOCKED_ON_SEED = new Set<QboCategory>([
  "SUSPENSE",
  "DEBT_INTEREST",
  "UNCATEGORIZED",
  "CAPEX",
  "INTERCOMPANY",
  "OWNER_EQUITY",
  "EXCLUDED",
]);

// --- explicit per-account overrides ----------------------------------------
// Every P&L account in HG's real chart of accounts (+ the balance-sheet accounts
// that would appear if a GeneralLedger pull is ever added). Keyed by
// fullyQualifiedName, with leaf-name fallbacks where unambiguous.

type Override = { category: QboCategory; treatment?: QboTreatment };

export const ACCOUNT_OVERRIDES: Record<string, Override> = {
  // income
  "Business & Other Revenue:Rents": { category: "RENT" },
  Rents: { category: "RENT" },
  "Business & Other Revenue:Fees & Other Revenue": { category: "OTHER_INCOME" },
  "Fees & Other Revenue": { category: "OTHER_INCOME" },

  // operating expense
  "Bank fees & service charges": { category: "BANK_FEES" },
  Insurance: { category: "INSURANCE" },
  "Other G&A:Insurance": { category: "INSURANCE" },
  "Legal & Professional Services": { category: "LEGAL_PROFESSIONAL" },
  "Other G&A:Legal & Other Professional Fees": { category: "LEGAL_PROFESSIONAL" },
  "Other G&A:Business licenses": { category: "TAXES" }, // Buffalo rental registration
  "Other G&A:Commissions:Leasing Commissions": { category: "LEASING_COMMISSION" },
  "Leasing Commissions": { category: "LEASING_COMMISSION" },
  "Other G&A:General Operating Expenses": { category: "OTHER_OPEX" },
  "General Operating Expenses": { category: "OTHER_OPEX" },
  "Other G&A:Repair Expense:Cleaning & Maintenance": { category: "REPAIRS" },
  "Other G&A:Repair Expense:Gardening & Landscaping": { category: "REPAIRS" },
  "Other G&A:Repair Expense:Plumbing Repairs": { category: "REPAIRS" },
  "Other G&A:Repair Expense:Repairs": { category: "REPAIRS" },
  "Other G&A:Repair Expense:Repairs Supplies": { category: "REPAIRS" },
  "Other G&A:Software Subscriptions": { category: "SOFTWARE" },
  "Software Subscriptions": { category: "SOFTWARE" },
  "Other G&A:Taxes:Taxes": { category: "TAXES" },
  "Other G&A:Taxes:City, State, & Local Taxes": { category: "TAXES" },
  "City, State, & Local Taxes": { category: "TAXES" },
  "Other operating expenses": { category: "BANK_FEES" }, // all lines are "Fee for Check Payment"
  Travel: { category: "TRAVEL" },
  "Uncategorized Expense": { category: "UNCATEGORIZED" },
  Utilities: { category: "UTILITIES" },
  "Utilities:Electric": { category: "UTILITIES" },
  "Utilities:GAS": { category: "UTILITIES" },
  "Utilities:Water & Sewer": { category: "UTILITIES" },
  Electric: { category: "UTILITIES" },
  GAS: { category: "UTILITIES" },
  "Water & Sewer": { category: "UTILITIES" },

  // below the line
  "Interest income": { category: "OTHER_INCOME", treatment: "NON_OPERATING" },
  "Suspense Receipts": { category: "SUSPENSE", treatment: "EXCLUDED" },
  "Interest expense": { category: "DEBT_INTEREST", treatment: "DEBT_INTEREST" },

  // balance sheet (only reachable via a future GeneralLedger pull)
  "Opening Balance Equity": { category: "OWNER_EQUITY", treatment: "EXCLUDED" },
  "Owner Contribution": { category: "OWNER_EQUITY", treatment: "EXCLUDED" },
  "Retained Earnings": { category: "OWNER_EQUITY", treatment: "EXCLUDED" },
  "Inter Co Receivables": { category: "INTERCOMPANY", treatment: "EXCLUDED" },
  "Inter Co Payables": { category: "INTERCOMPANY", treatment: "EXCLUDED" },
  "Security Deposits": { category: "EXCLUDED", treatment: "EXCLUDED" },
  "Mortgage Payments": { category: "EXCLUDED", treatment: "EXCLUDED" },
  "Short-term business loans": { category: "EXCLUDED", treatment: "EXCLUDED" },
  "Long-term business loans": { category: "EXCLUDED", treatment: "EXCLUDED" },
};

// --- Intuit acctSubType map (only the reliable ones) -----------------------

const SUBTYPE_BUCKET: Record<string, QboCategory> = {
  RentalIncome: "RENT",
  OtherPrimaryIncome: "OTHER_INCOME",
  ServiceFeeIncome: "OTHER_INCOME",
  SalesOfProductIncome: "OTHER_INCOME",
  InterestEarned: "OTHER_INCOME",
  Insurance: "INSURANCE",
  Utilities: "UTILITIES",
  RepairsAndMaintenance: "REPAIRS",
  Maintenance: "REPAIRS",
  SuppliesMaterials: "REPAIRS",
  Travel: "TRAVEL",
  TravelMeals: "TRAVEL",
  LegalProfessionalFees: "LEGAL_PROFESSIONAL",
  CommissionsAndFees: "LEASING_COMMISSION",
  BankCharges: "BANK_FEES",
  DuesSubscriptions: "SOFTWARE",
  Subscriptions: "SOFTWARE",
  TaxesPaid: "TAXES",
  PropertyTaxExpense: "TAXES",
  InterestPaid: "DEBT_INTEREST",
  OfficeGeneralAdministrativeExpenses: "OTHER_OPEX",
  OfficeExpenses: "OTHER_OPEX",
  AdvertisingPromotional: "OTHER_OPEX",
  OtherMiscellaneousServiceCost: "OTHER_OPEX",
};

// --- name / FQN regex -----------------------------------------------------

function regexBucket(text: string, classification: string | null): QboCategory | null {
  const s = text.toLowerCase();
  if (/\buncategor/.test(s)) return "UNCATEGORIZED";
  if (/\bsuspense\b|\bclearing\b|ask my accountant|opening balance/.test(s)) return "SUSPENSE";
  if (/interest (expense|paid)|mortgage interest|loan interest/.test(s)) return "DEBT_INTEREST";
  if (/interest (income|earned)/.test(s)) return "OTHER_INCOME";
  if (/\brent(s|al)?\b/.test(s) && classification === "Revenue") return "RENT";
  if (/manage(ment)?\b|mgmt fee|property mgmt|asset mgmt/.test(s)) return "MANAGEMENT";
  if (/leasing|\bcommission|locator|placement fee|tenant find/.test(s)) return "LEASING_COMMISSION";
  if (/insurance/.test(s)) return "INSURANCE";
  if (/\btax(es)?\b|licens|registration|user fee|permit/.test(s)) return "TAXES";
  if (
    /repair|maintenance|cleaning|turnover|make ?ready|landscap|garden|lawn|snow|plumb|hvac|electr(ic|ical) repair|handyman/.test(
      s,
    )
  )
    return "REPAIRS";
  if (/utilit|electric|\bgas\b|water|sewer|trash|garbage|national grid|national fuel|ngrid/.test(s))
    return "UTILITIES";
  if (/legal|attorney|professional|accounting|bookkeep|\bcpa\b|advisor|tax prep/.test(s))
    return "LEGAL_PROFESSIONAL";
  if (/bank fee|service charge|wire fee|\bnsf\b|overdraft|check payment fee/.test(s))
    return "BANK_FEES";
  if (/software|subscription|\bsaas\b|quickbooks|intuit|clear capture/.test(s)) return "SOFTWARE";
  if (/travel|mileage|airfare|lodging|\buber\b|\blyft\b/.test(s)) return "TRAVEL";
  return null;
}

// --- acctType fallback --------------------------------------------------------

function acctTypeBucket(acctType: string, classification: string | null): QboCategory {
  const t = acctType.toLowerCase();
  if (classification === "Asset" || classification === "Liability" || classification === "Equity")
    return "EXCLUDED";
  if (/accounts receivable|accounts payable|^bank$|credit card/.test(t)) return "EXCLUDED";
  if (t === "income") return "OTHER_INCOME";
  if (t === "other income") return "OTHER_INCOME";
  // Expense / Other Expense / COGS
  return "OTHER_OPEX";
}

// --- entry point -----------------------------------------------------------

function finalize(category: QboCategory, a: AccountInput, source: Seeded["source"]): Seeded {
  return {
    category,
    treatment: treatmentForCategory(category, a.classification),
    locked: CATEGORIES_LOCKED_ON_SEED.has(category),
    source,
  };
}

export function seedCategory(a: AccountInput): Seeded {
  const ov = ACCOUNT_OVERRIDES[a.fullyQualifiedName] ?? ACCOUNT_OVERRIDES[a.name];
  if (ov) {
    return {
      category: ov.category,
      treatment: ov.treatment ?? treatmentForCategory(ov.category, a.classification),
      locked: true,
      source: "override",
    };
  }

  const bySub = a.acctSubType ? SUBTYPE_BUCKET[a.acctSubType] : undefined;
  if (bySub) return finalize(bySub, a, "subtype");

  const byName =
    regexBucket(a.name, a.classification) ?? regexBucket(a.fullyQualifiedName, a.classification);
  if (byName) return finalize(byName, a, "regex");

  return finalize(acctTypeBucket(a.acctType, a.classification), a, "accttype");
}
