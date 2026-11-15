import { toYmd, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { isSold } from "@/lib/properties/figures";
import { UTILITY_GROUPS, isHouseMeterRow, parseInstallYear, parseUnits, withUnitIds, type UnitUtilities } from "@/lib/property-types";
import { leaseStatus, termToday } from "@/lib/tenants/status";

/**
 * Missing info (docs/specs/missing-info.md): every important blank, computed
 * from the records on each read and never stored. Pure: the loader is
 * ./queries, the writes are ./service, and checks.test.ts covers each rule.
 *
 * A gap is one field on one record ("Insurance carrier" at 118 Congress), keyed
 * `<check>|<subject>`. Required gaps count on Home and mark the page in
 * --warn; suggested ones live only on the worklist's Suggested tab (section 4).
 * A partner's "Doesn't apply" (a MissingInfoSkip) moves a gap to `skipped`.
 */

export type Priority = "required" | "suggested";

/** The section of the record page a gap marks. */
export type GapSection = "details" | "loan" | "insurance" | "units" | "lease" | "contractor";

/**
 * The real answer a row offers before Doesn't apply (D3). `status` and
 * `vacant` act in place on the worklist; the others open the record, where
 * the field's own editor takes the answer.
 */
export type GapAnswer =
  | { kind: "status"; propertyId: string; unitId: string; field: keyof UnitUtilities }
  | { kind: "vacant"; propertyId: string; unitId: string }
  | { kind: "open"; verb: string };

export interface Gap {
  /** `<check>|<subject>`, the row's identity: a skip and a Make task item point at it. */
  key: string;
  check: string;
  /** The record: "property:<id>", "unit:<propertyId>:<unitId>", "lease:<id>", "tenant:<id>", "contact:<id>". */
  subject: string;
  priority: Priority;
  /** The worklist group: a property or a contractor. */
  group: GapGroup;
  /** The unit or home the row is about ("Lower"), or null on a fact of the property or contractor itself. */
  place: string | null;
  /** The field, as its editor names it, with its record kind where the editor's name alone is vague: "Insurance carrier". */
  label: string;
  /** One short fact beside it: "Oct 31 has passed", "Dana Fox". */
  note: string | null;
  section: GapSection;
  /** The property field to open (openPropertyField) on a property fact. */
  field: string | null;
  /** The unit, on a unit row. */
  unitId: string | null;
  /** The lease, on a lease or tenant row. */
  leaseId: string | null;
  /** Where the row opens the field. */
  href: string;
  answer: GapAnswer | null;
  /** Its place within the group, in page order. */
  order: number;
}

export interface GapGroup {
  kind: "property" | "contractor";
  id: string;
  /** "118 Congress St", "Zack Reading". */
  label: string;
  href: string;
}

export interface SkippedGap extends Gap {
  skippedAt: Date | string;
  /** The partner's name, or null when they've since been deleted. */
  skippedBy: string | null;
}

export interface MissingInfo {
  gaps: Gap[];
  skipped: SkippedGap[];
}

/* ---------------- Input ---------------- */

type Day = Date | string | null | undefined;
type Amount = number | string | { toString(): string } | null | undefined;

export interface CheckTerm {
  id: string;
  startsOn: Day;
  endsOn: Day;
  fileId: string | null;
  subsidy: Amount;
  subsidyContact: string | null;
}

export interface CheckLeaseTenant {
  primary: boolean;
  tenant: { id: string; fullName: string; phone: string | null; email: string | null };
}

export interface CheckLease {
  id: string;
  unitId: string | null;
  unitLabel: string | null;
  movesIn: Day;
  movesOut: Day;
  deposit: Amount;
  terms: CheckTerm[];
  tenants: CheckLeaseTenant[];
}

export interface CheckProperty {
  id: string;
  address: string;
  status: string | null;
  currentLoan: Amount;
  lender: string | null;
  loanServicer: string | null;
  loanNumber: string | null;
  loanRate: Amount;
  loanPaymentMonthly: Amount;
  loanMaturityDate: Day;
  insuranceCarrier: string | null;
  insurancePolicyNo: string | null;
  insuranceRenewalDate: Day;
  insurancePremium: Amount;
  insuranceCoverage: Amount;
  propertyTaxDueDate: Day;
  rentalRegistrationExpiry: Day;
  units: unknown;
  /** Its listings' unit labels and statuses: an Available one means the unit is empty (D6). */
  listings: { unitLabel: string; status: string }[];
  leases: CheckLease[];
}

export interface CheckContact {
  id: string;
  fullName: string;
  active: boolean;
  /** A sign-up still waiting for Keep or Archive: not a contractor yet, so not checked. */
  needsReview: boolean;
  hasW9: boolean;
  /** A certificate on file, or "I don't carry business insurance". */
  hasInsurance: boolean;
  email: string | null;
  phone: string | null;
  /** Worked a job this calendar year, or (QuickBooks connected) was paid this year (D7). */
  worked: boolean;
}

export interface CheckSkip {
  check: string;
  subject: string;
  createdAt: Date | string;
  by: string | null;
}

export interface CheckInput {
  properties: CheckProperty[];
  contacts: CheckContact[];
  skips: CheckSkip[];
}

/* ---------------- Helpers ---------------- */

const blank = (v: string | null | undefined) => !v?.trim();
const blankAmount = (v: Amount) => v == null || String(v).trim() === "";
const positive = (v: Amount) => !blankAmount(v) && Number(String(v)) > 0;

export const gapKey = (check: string, subject: string) => `${check}|${subject}`;
export const propertySubject = (id: string) => `property:${id}`;
export const unitSubject = (propertyId: string, unitId: string) => `unit:${propertyId}:${unitId}`;
export const leaseSubject = (id: string) => `lease:${id}`;
export const tenantSubject = (id: string) => `tenant:${id}`;
export const contactSubject = (id: string) => `contact:${id}`;

/** A utility status box (autopay, Fuel's leave on) is answered with Done or NA (D4). */
export function statusAnswered(v: string | null | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "done" || s === "na";
}

/**
 * National Grid's leave on for landlord holds an account-style number
 * ("81531-59050"), so any value is an answer except a blank and the two
 * statuses that mean nobody knows yet.
 */
export function gridLoflAnswered(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  return s !== "" && !/^(call|need)\b/i.test(s);
}

/** Whether one utility box has its answer (D4). Account numbers count when they aren't blank, "TENANT" included. */
export function utilityAnswered(field: keyof UnitUtilities, v: string | null | undefined): boolean {
  if (field.endsWith("Acct")) return !blank(v);
  if (field === "nationalGridLofl") return gridLoflAnswered(v);
  return statusAnswered(v);
}

/** The utility boxes in the order the unit sheet lays them out, with the words a row uses. */
export const UTILITY_BOXES: { field: keyof UnitUtilities; label: string }[] = UTILITY_GROUPS.flatMap((g) =>
  g.fields.map(([field, short]) => ({
    field,
    label: `${g.name} ${short === "Acct #" ? "account" : short === "LOFL" ? "leave on for landlord" : short.toLowerCase()}`,
  })),
);

/** The status boxes that take Done or NA in place on the worklist. */
const STATUS_FIELDS = new Set<keyof UnitUtilities>(["nationalGridAutopay", "nationalFuelAutopay", "nationalFuelLofl", "waterAutopay"]);

const isRehabbing = (status: string | null) => /^rehab/i.test(status?.trim() ?? "");

/** The terms a check reads for a lease: the one in force today, or an upcoming lease's first. */
function termInForce(lease: CheckLease, today: Ymd): CheckTerm | null {
  return termToday(lease.terms, today)?.term ?? null;
}

/* ---------------- The checks ---------------- */

/**
 * Every gap across the live properties and contractors, in worklist order:
 * properties by street, then contractors by name; inside a group, the
 * property's own facts, then each unit in the list's order, then its leases.
 */
export function missingInfo(input: CheckInput, today: Ymd): MissingInfo {
  const all: Gap[] = [];
  const properties = input.properties.filter((p) => !isSold(p.status));
  for (const p of [...properties].sort((a, b) => propertyLabel(a).localeCompare(propertyLabel(b)))) all.push(...propertyGaps(p, today));
  const contacts = input.contacts.filter((c) => !c.needsReview);
  for (const c of [...contacts].sort((a, b) => a.fullName.trim().localeCompare(b.fullName.trim()))) all.push(...contactGaps(c));

  const skips = new Map(input.skips.map((s) => [gapKey(s.check, s.subject), s]));
  const gaps: Gap[] = [];
  const skipped: SkippedGap[] = [];
  // A row is one field on one record: a tenant on two leases still has one email to fill in.
  const once = new Set<string>();
  for (const g of all) {
    if (once.has(g.key)) continue;
    once.add(g.key);
    const s = skips.get(g.key);
    if (s) skipped.push({ ...g, skippedAt: s.createdAt, skippedBy: s.by });
    else gaps.push(g);
  }
  return { gaps, skipped };
}

const propertyLabel = (p: { address: string }) => shortAddress(p.address) || p.address;

function propertyGaps(p: CheckProperty, today: Ymd): Gap[] {
  const group: GapGroup = { kind: "property", id: p.id, label: propertyLabel(p), href: `/properties/${p.id}` };
  const out: Gap[] = [];
  const subject = propertySubject(p.id);
  let order = 0;

  /** A fact on the property itself, opened in its section's editor. */
  const fact = (check: string, priority: Priority, section: GapSection, field: string, label: string, note: string | null = null, verb?: string) =>
    out.push({
      key: gapKey(check, subject),
      check,
      subject,
      priority,
      group,
      place: null,
      label,
      note,
      section,
      field,
      unitId: null,
      leaseId: null,
      href: `/properties/${p.id}?fill=${field}`,
      answer: verb ? { kind: "open", verb } : null,
      order: order++,
    });

  // Insurance: a lapse means force-placed cover and a technical default.
  if (blank(p.insuranceCarrier)) fact("insurance.carrier", "required", "insurance", "insuranceCarrier", "Insurance carrier");
  if (blank(p.insurancePolicyNo)) fact("insurance.policy", "required", "insurance", "insurancePolicyNo", "Insurance policy number");
  if (!toYmd(p.insuranceRenewalDate)) fact("insurance.renewal", "required", "insurance", "insuranceRenewalDate", "Insurance renewal date", null, "Set date");
  if (blankAmount(p.insurancePremium)) fact("insurance.premium", "suggested", "insurance", "insurancePremium", "Insurance premium");
  if (blankAmount(p.insuranceCoverage)) fact("insurance.coverage", "suggested", "insurance", "insuranceCoverage", "Insurance coverage");

  // The loan, only with a balance: a property owned free and clear has none of these.
  if (positive(p.currentLoan)) {
    if (!toYmd(p.loanMaturityDate)) fact("loan.maturity", "required", "loan", "loanMaturityDate", "Loan maturity date", null, "Set date");
    if (blank(p.lender)) fact("loan.lender", "required", "loan", "lender", "Lender");
    if (blank(p.loanServicer)) fact("loan.servicer", "required", "loan", "loanServicer", "Loan servicer");
    if (blankAmount(p.loanPaymentMonthly)) fact("loan.payment", "required", "loan", "loanPaymentMonthly", "Monthly loan payment");
    if (blankAmount(p.loanRate)) fact("loan.rate", "suggested", "loan", "loanRate", "Loan rate");
    if (blank(p.loanNumber)) fact("loan.number", "suggested", "loan", "loanNumber", "Loan number");
  }

  // Key dates on Details. A tax due date that has passed needs the next one (D8); a passed registration keeps its
  // Late row in Needs you instead.
  const tax = toYmd(p.propertyTaxDueDate);
  if (!tax) fact("tax.due", "required", "details", "propertyTaxDueDate", "Next property tax due date", null, "Set date");
  else if (tax < today) fact("tax.due", "required", "details", "propertyTaxDueDate", "Next property tax due date", `${shortDay(tax)} has passed`, "Set date");
  if (!toYmd(p.rentalRegistrationExpiry)) fact("registration.expiry", "required", "details", "rentalRegistrationExpiry", "Rental registration expiry", null, "Set date");

  // Units, in the list's order. House meters get the utility checks only.
  const units = withUnitIds(parseUnits(p.units));
  const leases = p.leases.filter((l) => leaseStatus(l, today) !== "past");
  const listed = new Set(p.listings.filter((l) => l.status === "AVAILABLE").map((l) => l.unitLabel.trim().toLowerCase()));
  units.forEach((u, i) => {
    const unitId = u.id as string;
    const place = u.label?.trim() || `Unit ${i + 1}`;
    const uSubject = unitSubject(p.id, unitId);
    const unitRow = (check: string, priority: Priority, label: string, answer: GapAnswer | null, note: string | null = null) =>
      out.push({
        key: gapKey(check, uSubject),
        check,
        subject: uSubject,
        priority,
        group,
        place,
        label,
        note,
        section: "units",
        field: null,
        unitId,
        leaseId: null,
        href: `/properties/${p.id}?unit=${encodeURIComponent(unitId)}`,
        answer,
        order: order++,
      });

    for (const box of UTILITY_BOXES) {
      if (utilityAnswered(box.field, u.utilities?.[box.field])) continue;
      const answer: GapAnswer | null = STATUS_FIELDS.has(box.field) ? { kind: "status", propertyId: p.id, unitId, field: box.field } : null;
      unitRow(`utility.${box.field}`, "required", box.label, answer, statusNote(u.utilities?.[box.field]));
    }
    if (isHouseMeterRow(u)) return;

    // No lease living here or on its way (D6): Rehabbing or an Available listing says it's empty, and so does
    // "Vacant since"; otherwise ask once.
    const housed = leases.some((l) => (l.unitId ?? null) === unitId);
    // Vacant since holds until a lease moves in on or after it: once that household has left, the unit asks again.
    const since = u.vacantSince?.trim() || null;
    const markedVacant = !!since && !p.leases.some((l) => (l.unitId ?? null) === unitId && (toYmd(l.movesIn) ?? "") >= since);
    if (!housed && !isRehabbing(p.status) && !listed.has(place.toLowerCase()) && !markedVacant) {
      unitRow("unit.lease", "required", "No current lease", { kind: "vacant", propertyId: p.id, unitId });
    }
    if (blank(u.lockboxCode)) unitRow("unit.lockbox", "suggested", "Lockbox code", null);
    const undated = (u.equipment ?? []).filter((e) => e.type?.trim() && parseInstallYear(e.installYear) == null).length;
    if (undated > 0) unitRow("unit.installYears", "suggested", "Install years", null, `${undated} ${undated === 1 ? "appliance" : "appliances"}`);
  });

  // Leases living here now or on their way, in the order of their units.
  const unitOrder = new Map(units.map((u, i) => [u.id as string, i]));
  const sorted = [...leases].sort((a, b) => (unitOrder.get(a.unitId ?? "") ?? 999) - (unitOrder.get(b.unitId ?? "") ?? 999));
  for (const l of sorted) {
    const lSubject = leaseSubject(l.id);
    const place = l.unitLabel?.trim() || null;
    const href = `/tenants/${l.id}`;
    const leaseRow = (check: string, priority: Priority, label: string, s = lSubject, note: string | null = null, verb?: string) =>
      out.push({
        key: gapKey(check, s),
        check,
        subject: s,
        priority,
        group,
        place,
        label,
        note,
        section: "lease",
        field: null,
        unitId: l.unitId,
        leaseId: l.id,
        href,
        answer: verb ? { kind: "open", verb } : null,
        order: order++,
      });

    const term = termInForce(l, today);
    if (!term) leaseRow("lease.rent", "required", "Rent", lSubject, null, "Add term");
    else if (!term.fileId) leaseRow("lease.pdf", "required", "Signed lease PDF", lSubject, null, "Upload");
    const primary = l.tenants.find((t) => t.primary) ?? l.tenants[0];
    if (primary && blank(primary.tenant.phone)) leaseRow("lease.phone", "required", "Primary tenant's phone", lSubject, primary.tenant.fullName.trim());
    if (blankAmount(l.deposit)) leaseRow("lease.deposit", "suggested", "Security deposit");
    if (term && positive(term.subsidy) && blank(term.subsidyContact)) leaseRow("lease.caseworker", "suggested", "Section 8 caseworker");
    for (const t of l.tenants) {
      if (blank(t.tenant.email)) leaseRow("tenant.email", "suggested", `${t.tenant.fullName.trim() || "Tenant"}'s email`, tenantSubject(t.tenant.id));
    }
  }
  return out;
}

function contactGaps(c: CheckContact): Gap[] {
  // An inactive contractor who hasn't worked this year isn't asked for anything.
  if (!c.active && !c.worked) return [];
  const name = c.fullName.trim() || "Contractor";
  const group: GapGroup = { kind: "contractor", id: c.id, label: name, href: `/contractors/${c.id}` };
  const subject = contactSubject(c.id);
  const out: Gap[] = [];
  let order = 0;
  const row = (check: string, priority: Priority, label: string, verb?: string) =>
    out.push({
      key: gapKey(check, subject),
      check,
      subject,
      priority,
      group,
      place: null,
      label,
      note: null,
      section: "contractor",
      field: null,
      unitId: null,
      leaseId: null,
      href: group.href,
      answer: verb ? { kind: "open", verb } : null,
      order: order++,
    });
  if (!c.hasW9) row("contact.w9", c.worked ? "required" : "suggested", "W-9", "Add W-9");
  if (!c.active) return out;
  if (!c.hasInsurance) row("contact.insurance", "suggested", "Insurance certificate");
  if (blank(c.email)) row("contact.email", "suggested", "Email");
  if (blank(c.phone)) row("contact.phone", "suggested", "Phone");
  return out;
}

/** What a status box says now, when it says something: "Call to confirm". */
function statusNote(v: string | null | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/** "Oct 31" for a passed date: always this year or last, so no year. */
function shortDay(day: Ymd): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

/* ---------------- Views ---------------- */

/** The gaps of one priority. */
export const ofPriority = (gaps: readonly Gap[], p: Priority) => gaps.filter((g) => g.priority === p);

/** Gaps grouped for the worklist, groups in the order their first row comes. */
export function groupGaps<G extends Gap>(gaps: readonly G[]): { group: GapGroup; rows: G[] }[] {
  const out = new Map<string, { group: GapGroup; rows: G[] }>();
  for (const g of gaps) {
    const k = `${g.group.kind}:${g.group.id}`;
    const entry = out.get(k) ?? { group: g.group, rows: [] };
    entry.rows.push(g);
    out.set(k, entry);
  }
  return [...out.values()];
}

/**
 * The places a count covers, for Home's row: "11 properties, 8 contractors",
 * "1 property", or "" with none.
 */
export function placesLine(gaps: readonly Gap[]): string {
  const props = new Set(gaps.filter((g) => g.group.kind === "property").map((g) => g.group.id)).size;
  const people = new Set(gaps.filter((g) => g.group.kind === "contractor").map((g) => g.group.id)).size;
  const parts = [
    props > 0 ? `${props} ${props === 1 ? "property" : "properties"}` : null,
    people > 0 ? `${people} ${people === 1 ? "contractor" : "contractors"}` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

/** A row's full name where its group isn't shown beside it (a toast, a checklist item): "Lower · National Fuel autopay". */
export function rowName(g: Pick<Gap, "place" | "label">): string {
  return g.place ? `${g.place} · ${g.label}` : g.label;
}

/** How many required gaps each section of a record has, for "· 3 missing" beside its title. */
export function sectionCounts(gaps: readonly Gap[]): Partial<Record<GapSection, number>> {
  const out: Partial<Record<GapSection, number>> = {};
  for (const g of gaps) if (g.priority === "required") out[g.section] = (out[g.section] ?? 0) + 1;
  return out;
}

/* ---------------- Make task ---------------- */

export interface TaskFill {
  /** "Fill in 3 items at 118 Congress St". */
  title: string;
  /** The rows, in worklist order. */
  keys: string[];
  /** One checklist item per row: its name, with its place's name when the rows span more than one. */
  items: string[];
  /** The property every row belongs to, or null when they span several or include a contractor. */
  propertyId: string | null;
}

/** Most rows one Make task takes: a checklist past this is a list, not a task. */
export const MAKE_TASK_MAX = 50;

/**
 * What Make task fills New task with (D9), from the rows asked for that are
 * still gaps, in worklist order. Null when none of them is (filled in since).
 */
export function taskFillOf(gaps: readonly Gap[], keys: readonly string[]): TaskFill | null {
  const wanted = new Set(keys);
  const rows = gaps.filter((g) => wanted.has(g.key)).slice(0, MAKE_TASK_MAX);
  if (rows.length === 0) return null;
  const groups = new Set(rows.map((g) => `${g.group.kind}:${g.group.id}`));
  const one = groups.size === 1 ? rows[0].group : null;
  const count = `${rows.length} ${rows.length === 1 ? "item" : "items"}`;
  const title = !one ? `Fill in ${count} of missing info` : one.kind === "property" ? `Fill in ${count} at ${one.label}` : `Fill in ${count} for ${one.label}`;
  return {
    title,
    keys: rows.map((g) => g.key),
    items: rows.map((g) => (one ? rowName(g) : `${g.group.label} · ${rowName(g)}`)),
    propertyId: one?.kind === "property" ? one.id : null,
  };
}

/**
 * The Make task items to tick (D9): the open ones whose row is no longer a
 * gap, because it was filled in, skipped, or its record is gone. An item with
 * no key is a plain checklist item and never ticks itself.
 */
export function itemsToSettle<I extends { checkKey: string | null }>(open: readonly I[], gaps: readonly Pick<Gap, "key">[]): I[] {
  const live = new Set(gaps.map((g) => g.key));
  return open.filter((i) => i.checkKey !== null && !live.has(i.checkKey));
}
