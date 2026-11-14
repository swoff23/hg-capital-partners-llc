import { EMAIL_INVALID, PHONE_INVALID, readPhone, tooLong } from "@/lib/contractors/contact-fields";
import { toYmd, type Ymd } from "@/lib/dates";
import { NUMBER_MESSAGE, readNumber, toDecimalString } from "@/lib/money";
import { looksLikeEmail, normalizeEmail } from "@/lib/portal/credentials";

/**
 * How a tenant's and a lease's fields read before src/lib/tenants/service.ts
 * writes them (docs/specs/tenants.md section 3). Pure; see fields.test.ts. The
 * forms run the same checks in the browser before they send. Every problem
 * comes back keyed by field, so a sheet marks each one and focuses the first.
 * Blank text saves as null.
 */

export const TENANT_NAME_REQUIRED = "Enter the tenant's name.";
export const STARTS_REQUIRED = "Enter when the lease starts.";
export const ENDS_BEFORE_START = "The lease ends after it starts.";
export const RENT_REQUIRED = "Enter the monthly rent.";
export const SUBSIDY_OVER_RENT = "The housing authority can't pay more than the rent.";
export const MOVE_OUT_BEFORE_IN = "Move-out comes after move-in.";
export const DATE_INVALID = "Enter a date, like Feb 1, 2027.";

export const MAX_TENANTS = 10;

export type Problems = Record<string, string>;
export type Read<T> = { ok: true; data: T } | { ok: false; problems: Problems };

type Input = Partial<Record<string, string | null | undefined>>;

const TENANT_MAX = { fullName: 120, phone: 40, email: 254, notes: 10_000 } as const;
export type TenantField = keyof typeof TENANT_MAX;
export const TENANT_FIELDS = Object.keys(TENANT_MAX) as TenantField[];

export type TenantData = {
  fullName?: string;
  phone?: string | null;
  phoneE164?: string | null;
  email?: string | null;
  notes?: string | null;
};

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const tidyText = (s: string) => s.replace(/\r\n?/g, "\n").trim();

/**
 * A tenant's fields. `mode: "new"` needs the name; `"patch"` reads only the
 * fields present, so an inline edit of one fact writes that one column. The
 * phone goes through the contractor's `readPhone`, so it reads and dials the
 * same way, and `phoneE164` is always written with it.
 */
export function readTenant(input: Input, mode: "new" | "patch"): Read<TenantData> {
  const problems: Problems = {};
  const data: TenantData = {};
  for (const field of TENANT_FIELDS) {
    const raw = input[field];
    if (raw === undefined || raw === null) {
      if (field === "fullName" && mode === "new") problems.fullName = TENANT_NAME_REQUIRED;
      continue;
    }
    const text = field === "notes" ? tidyText(raw) : oneLine(raw);
    if (text.length > TENANT_MAX[field]) {
      problems[field] = tooLong(TENANT_MAX[field]);
      continue;
    }
    switch (field) {
      case "fullName":
        if (!text) problems.fullName = TENANT_NAME_REQUIRED;
        else data.fullName = text;
        break;
      case "phone": {
        const read = readPhone(text);
        if (!read) problems.phone = PHONE_INVALID;
        else Object.assign(data, read);
        break;
      }
      case "email": {
        const email = normalizeEmail(text);
        if (email && !looksLikeEmail(email)) problems.email = EMAIL_INVALID;
        else data.email = email || null;
        break;
      }
      default:
        data[field] = text || null;
    }
  }
  return Object.keys(problems).length ? { ok: false, problems } : { ok: true, data };
}

/** A date field's text as a Buffalo day; blank is null. `undefined` when it doesn't read. */
function readDay(raw: string | null | undefined): Ymd | null | undefined {
  if (raw == null || raw.trim() === "") return null;
  return toYmd(raw.trim()) ?? undefined;
}

export type StayData = { movesIn?: Ymd | null; movesOut?: Ymd | null };

/**
 * The household's move dates. `current` is what's stored, so a patch of one
 * date is checked against the other: a move-out on or before the move-in is
 * refused under the field that changed.
 */
export function readStay(input: Input, current: { movesIn: Ymd | null; movesOut: Ymd | null } = { movesIn: null, movesOut: null }): Read<StayData> {
  const problems: Problems = {};
  const data: StayData = {};
  for (const field of ["movesIn", "movesOut"] as const) {
    if (!(field in input)) continue;
    const day = readDay(input[field]);
    if (day === undefined) problems[field] = DATE_INVALID;
    else data[field] = day;
  }
  if (Object.keys(problems).length) return { ok: false, problems };
  const movesIn = "movesIn" in data ? data.movesIn! : current.movesIn;
  const movesOut = "movesOut" in data ? data.movesOut! : current.movesOut;
  if (movesIn && movesOut && movesOut <= movesIn) {
    return { ok: false, problems: { ["movesOut" in data ? "movesOut" : "movesIn"]: MOVE_OUT_BEFORE_IN } };
  }
  return { ok: true, data };
}

export type TermData = {
  startsOn: Ymd;
  endsOn: Ymd | null;
  rent: string; // a Decimal string, "1900.00"
  subsidy: string | null;
  subsidyFrom: string | null;
  /** The housing authority's contact for this term (the Section 8 caseworker): kept only with a share. */
  subsidyContact: string | null;
  subsidyEmail: string | null;
};

/** One signed term: when it runs, the whole rent and the housing authority's share of it. */
export function readTerm(input: Input): Read<TermData> {
  const problems: Problems = {};
  const startsOn = readDay(input.startsOn);
  if (startsOn === undefined) problems.startsOn = DATE_INVALID;
  else if (startsOn === null) problems.startsOn = STARTS_REQUIRED;
  const endsOn = readDay(input.endsOn);
  if (endsOn === undefined) problems.endsOn = DATE_INVALID;
  if (startsOn && endsOn && endsOn < startsOn) problems.endsOn = ENDS_BEFORE_START;

  const rent = readNumber("money", input.rent ?? "");
  if (!rent.ok) problems.rent = rent.message;
  else if (rent.value === null || rent.value === 0) problems.rent = RENT_REQUIRED;
  const subsidy = readNumber("money", input.subsidy ?? "");
  if (!subsidy.ok) problems.subsidy = subsidy.message;
  else if (rent.ok && rent.value && subsidy.value !== null && subsidy.value > rent.value) problems.subsidy = SUBSIDY_OVER_RENT;

  const from = oneLine(input.subsidyFrom ?? "");
  if (from.length > 200) problems.subsidyFrom = tooLong(200);
  const contact = oneLine(input.subsidyContact ?? "");
  if (contact.length > 120) problems.subsidyContact = tooLong(120);
  const email = normalizeEmail(input.subsidyEmail ?? "");
  if (email && !looksLikeEmail(email)) problems.subsidyEmail = EMAIL_INVALID;

  if (Object.keys(problems).length) return { ok: false, problems };
  const share = subsidy.ok && subsidy.value ? toDecimalString(subsidy.value) : null;
  return {
    ok: true,
    data: {
      startsOn: startsOn!,
      endsOn: endsOn ?? null,
      rent: toDecimalString((rent as { value: number }).value)!,
      subsidy: share,
      // Who pays, and their contact, only mean something with a share.
      subsidyFrom: share ? from || null : null,
      subsidyContact: share ? contact || null : null,
      subsidyEmail: share ? email || null : null,
    },
  };
}

/** A deposit: blank clears it; otherwise an amount. */
export function readDeposit(raw: string | null | undefined): Read<{ deposit: string | null }> {
  const n = readNumber("money", raw ?? "");
  if (!n.ok) return { ok: false, problems: { deposit: NUMBER_MESSAGE.money } };
  return { ok: true, data: { deposit: toDecimalString(n.value) } };
}

/** What the tenant pays themselves: the rent less the housing authority's share. */
export function tenantShare(rent: string | number, subsidy: string | number | null | undefined): number {
  const r = Number(rent);
  const s = subsidy == null ? 0 : Number(subsidy);
  return Math.max(0, Math.round((r - s) * 100) / 100);
}

export const TENANT_PAYS_REQUIRED = "Enter what the tenant pays each month.";

/**
 * The whole monthly rent from the two parts the forms ask for (Connor, Nov 14):
 * what the tenant pays and the housing authority's share. Blank Tenant pays is
 * $0 when the housing authority covers it all; with no share either, it's
 * required. The rent saves as their sum, so the share stays at most the rent.
 */
export function rentFromParts(tenantPays: string, subsidy: string): Read<{ rent: string }> {
  const tenant = readNumber("money", tenantPays ?? "");
  const share = readNumber("money", subsidy ?? "");
  const problems: Problems = {};
  if (!tenant.ok) problems.tenantPays = tenant.message;
  if (!share.ok) problems.subsidy = share.message;
  if (Object.keys(problems).length) return { ok: false, problems };
  const total = ((tenant as { value: number | null }).value ?? 0) + ((share as { value: number | null }).value ?? 0);
  if (total <= 0) return { ok: false, problems: { tenantPays: TENANT_PAYS_REQUIRED } };
  return { ok: true, data: { rent: toDecimalString(total)! } };
}
