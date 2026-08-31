/** Display labels for the QboCategory / QboClassRole enums. */

export const CATEGORY_LABELS: Record<string, string> = {
  RENT: "Rent",
  OTHER_INCOME: "Other income",
  TAXES: "Taxes & licenses",
  INSURANCE: "Insurance",
  REPAIRS: "Repairs & maintenance",
  UTILITIES: "Utilities",
  MANAGEMENT: "Management",
  LEGAL_PROFESSIONAL: "Legal & professional",
  LEASING_COMMISSION: "Leasing commission",
  BANK_FEES: "Bank fees",
  SOFTWARE: "Software",
  TRAVEL: "Travel",
  OTHER_OPEX: "Other operating",
  DEBT_INTEREST: "Mortgage interest",
  UNCATEGORIZED: "Uncategorized",
  CAPEX: "Capital improvements",
  INTERCOMPANY: "Inter-company",
  OWNER_EQUITY: "Owner equity",
  SUSPENSE: "Suspense / clearing",
  EXCLUDED: "Excluded",
  OTHER: "Other",
};

export const ROLE_LABELS: Record<string, string> = {
  UNMAPPED: "Unmapped",
  PROPERTY: "Property",
  ENTITY: "Entity",
  OVERHEAD: "Overhead (General)",
  IGNORE: "Ignore",
};
