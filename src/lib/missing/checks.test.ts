import test from "node:test";
import assert from "node:assert/strict";
import {
  gapKey,
  groupGaps,
  itemsToSettle,
  missingInfo,
  placesLine,
  rowName,
  sectionCounts,
  taskFillOf,
  utilityAnswered,
  type CheckContact,
  type CheckInput,
  type CheckLease,
  type CheckProperty,
} from "./checks";

const TODAY = "2026-11-15";

/** Every utility box answered, so a test sees only what it breaks. */
const doneUtilities = {
  nationalGridAcct: "1234",
  nationalGridAutopay: "Done",
  nationalGridLofl: "22803-89006",
  nationalFuelAcct: "5678",
  nationalFuelAutopay: "NA",
  nationalFuelLofl: "Done",
  waterAcct: "W-1",
  waterAutopay: "NA",
};

const lease = (over: Partial<CheckLease> = {}): CheckLease => ({
  id: "l1",
  unitId: "u1",
  unitLabel: "Lower",
  movesIn: "2025-03-01",
  movesOut: null,
  deposit: "1500",
  terms: [{ id: "t1", startsOn: "2025-03-01", endsOn: "2027-02-28", fileId: "f1", subsidy: null, subsidyContact: null }],
  tenants: [{ primary: true, tenant: { id: "n1", fullName: "Dana Fox", phone: "716-555-1234", email: "dana@example.com" } }],
  ...over,
});

/** A property with everything filled in. */
const property = (over: Partial<CheckProperty> = {}): CheckProperty => ({
  id: "p1",
  address: "118 Congress St. Buffalo, NY 14213",
  status: "Refinanced",
  currentLoan: "300000",
  lender: "Vontive",
  loanServicer: "Fay Servicing",
  loanNumber: "L-1",
  loanRate: "7.25",
  loanPaymentMonthly: "2100",
  loanMaturityDate: "2054-01-01",
  insuranceCarrier: "Erie",
  insurancePolicyNo: "Q123",
  insuranceRenewalDate: "2027-03-01",
  insurancePremium: "2400",
  insuranceCoverage: "500000",
  propertyTaxDueDate: "2027-01-31",
  rentalRegistrationExpiry: "2027-06-30",
  units: [{ id: "u1", label: "Lower", lockboxCode: "1234", utilities: doneUtilities, equipment: [{ type: "Furnace", installYear: "2016" }] }],
  listings: [],
  leases: [lease()],
  ...over,
});

const contact = (over: Partial<CheckContact> = {}): CheckContact => ({
  id: "c1",
  fullName: "Zack Reading",
  active: true,
  needsReview: false,
  hasW9: true,
  hasInsurance: true,
  email: "zack@example.com",
  phone: "716-555-0000",
  worked: true,
  ...over,
});

const run = (over: Partial<CheckInput> = {}) => missingInfo({ properties: [property()], contacts: [contact()], skips: [], ...over }, TODAY);
const checks = (over: Partial<CheckInput> = {}) => run(over).gaps.map((g) => `${g.priority}:${g.check}`);

test("a record with everything filled in has no gaps", () => {
  assert.deepEqual(run().gaps, []);
});

test("insurance: carrier, policy and renewal are required; premium and coverage suggested", () => {
  const got = checks({
    properties: [property({ insuranceCarrier: " ", insurancePolicyNo: null, insuranceRenewalDate: null, insurancePremium: null, insuranceCoverage: "" })],
  });
  assert.deepEqual(got, [
    "required:insurance.carrier",
    "required:insurance.policy",
    "required:insurance.renewal",
    "suggested:insurance.premium",
    "suggested:insurance.coverage",
  ]);
});

test("loan checks only run with a balance", () => {
  const blankLoan = { lender: null, loanServicer: null, loanNumber: null, loanRate: null, loanPaymentMonthly: null, loanMaturityDate: null };
  assert.deepEqual(checks({ properties: [property({ ...blankLoan, currentLoan: "0" })] }), []);
  assert.deepEqual(checks({ properties: [property({ ...blankLoan, currentLoan: null })] }), []);
  assert.deepEqual(checks({ properties: [property({ ...blankLoan })] }), [
    "required:loan.maturity",
    "required:loan.lender",
    "required:loan.servicer",
    "required:loan.payment",
    "suggested:loan.rate",
    "suggested:loan.number",
  ]);
});

test("a property tax date that has passed needs the next one (D8)", () => {
  const passed = run({ properties: [property({ propertyTaxDueDate: "2026-10-31" })] }).gaps;
  assert.equal(passed.length, 1);
  assert.equal(passed[0].check, "tax.due");
  assert.equal(passed[0].note, "Oct 31 has passed");
  assert.deepEqual(checks({ properties: [property({ propertyTaxDueDate: TODAY })] }), [], "today hasn't passed");
  assert.deepEqual(checks({ properties: [property({ propertyTaxDueDate: null, rentalRegistrationExpiry: null })] }), [
    "required:tax.due",
    "required:registration.expiry",
  ]);
});

test("every utility box needs an answer: Done or NA for a status, any value for an account (D4)", () => {
  assert.equal(utilityAnswered("nationalFuelAutopay", "Done"), true);
  assert.equal(utilityAnswered("nationalFuelAutopay", " na "), true);
  assert.equal(utilityAnswered("nationalFuelAutopay", "Need to set up"), false);
  assert.equal(utilityAnswered("nationalFuelLofl", "Call to confirm"), false);
  assert.equal(utilityAnswered("nationalFuelLofl", null), false);
  assert.equal(utilityAnswered("nationalGridLofl", "81531-59050"), true);
  assert.equal(utilityAnswered("nationalGridLofl", "Call to confirm"), false);
  assert.equal(utilityAnswered("nationalGridAcct", "TENANT"), true);
  assert.equal(utilityAnswered("waterAcct", "  "), false);

  const units = [{ id: "u1", label: "Lower", lockboxCode: "1", utilities: { ...doneUtilities, nationalFuelLofl: "Call to confirm", nationalGridAcct: "" } }];
  const gaps = run({ properties: [property({ units })] }).gaps;
  assert.deepEqual(
    gaps.map((g) => [g.check, g.label, g.note, g.answer?.kind ?? null]),
    [
      ["utility.nationalGridAcct", "National Grid account", null, null],
      ["utility.nationalFuelLofl", "National Fuel leave on for landlord", "Call to confirm", "status"],
    ],
  );
  assert.equal(gaps[1].href, "/properties/p1?unit=u1");
  assert.equal(rowName(gaps[1]), "Lower · National Fuel leave on for landlord");
});

test("house meters get the utility checks and nothing else", () => {
  const units = [
    { id: "u1", label: "Lower", lockboxCode: "1", utilities: doneUtilities },
    { id: "h", label: "HSE (house)", utilities: { ...doneUtilities, waterAutopay: null } },
  ];
  assert.deepEqual(checks({ properties: [property({ units })] }), ["required:utility.waterAutopay"]);
});

test("a unit with no lease asks once, unless rehabbing, listed or marked vacant (D6)", () => {
  const units = [{ id: "u1", label: "Lower", lockboxCode: "1", utilities: doneUtilities }];
  const empty = run({ properties: [property({ units, leases: [] })] }).gaps;
  assert.deepEqual(
    empty.map((g) => [g.check, g.answer]),
    [["unit.lease", { kind: "vacant", propertyId: "p1", unitId: "u1" }]],
  );
  assert.deepEqual(checks({ properties: [property({ units, leases: [], status: "Rehabbing" })] }), []);
  assert.deepEqual(checks({ properties: [property({ units, leases: [], listings: [{ unitLabel: " lower ", status: "AVAILABLE" }] })] }), []);
  assert.deepEqual(checks({ properties: [property({ units, leases: [], listings: [{ unitLabel: "Lower", status: "HIDDEN" }] })] }), ["required:unit.lease"]);
  assert.deepEqual(checks({ properties: [property({ units: [{ ...units[0], vacantSince: "2026-11-01" }], leases: [] })] }), []);
  // A household that moved in after Vacant since, and has since left, makes the unit ask again.
  const later = lease({ movesIn: "2026-11-05", movesOut: "2026-11-10" });
  assert.deepEqual(checks({ properties: [property({ units: [{ ...units[0], vacantSince: "2026-11-01" }], leases: [later] })] }), ["required:unit.lease"]);
  // A lease on its way counts; one that's over doesn't.
  assert.deepEqual(checks({ properties: [property({ units, leases: [lease({ movesIn: "2026-12-01", terms: [] })] })] }), ["required:lease.rent"]);
  assert.deepEqual(checks({ properties: [property({ units, leases: [lease({ movesOut: "2026-10-01" })] })] }), ["required:unit.lease"]);
});

test("units without ids still get rows, under their placeholder", () => {
  const units = [{ label: "Upper", lockboxCode: "1", utilities: { ...doneUtilities, waterAcct: null } }];
  const g = run({ properties: [property({ units, leases: [] })] }).gaps;
  assert.deepEqual(
    g.map((x) => x.subject),
    ["unit:p1:unit-at-0", "unit:p1:unit-at-0"],
  );
});

test("leases: the PDF of the term in force, rent, the primary tenant's phone", () => {
  const noPdf = lease({ terms: [{ id: "t1", startsOn: "2025-03-01", endsOn: "2027-02-28", fileId: null, subsidy: null, subsidyContact: null }] });
  assert.deepEqual(checks({ properties: [property({ leases: [noPdf] })] }), ["required:lease.pdf"]);
  assert.deepEqual(checks({ properties: [property({ leases: [lease({ terms: [] })] })] }), ["required:lease.rent"]);
  const noPhone = lease({
    tenants: [
      { primary: false, tenant: { id: "n2", fullName: "Sam Fox", phone: "716", email: "s@example.com" } },
      { primary: true, tenant: { id: "n1", fullName: "Dana Fox", phone: "", email: "d@example.com" } },
    ],
  });
  const g = run({ properties: [property({ leases: [noPhone] })] }).gaps;
  assert.deepEqual(
    g.map((x) => [x.check, x.note, x.href]),
    [["lease.phone", "Dana Fox", "/tenants/l1"]],
  );
});

test("suggested lease checks: deposit, the Section 8 caseworker, each tenant's email", () => {
  const l = lease({
    deposit: null,
    terms: [{ id: "t1", startsOn: "2025-03-01", endsOn: null, fileId: "f", subsidy: "900", subsidyContact: null }],
    tenants: [{ primary: true, tenant: { id: "n1", fullName: "Dana Fox", phone: "716", email: null } }],
  });
  const g = run({ properties: [property({ leases: [l] })] }).gaps;
  assert.deepEqual(
    g.map((x) => [x.priority, x.check, x.subject]),
    [
      ["suggested", "lease.deposit", "lease:l1"],
      ["suggested", "lease.caseworker", "lease:l1"],
      ["suggested", "tenant.email", "tenant:n1"],
    ],
  );
});

test("suggested unit checks: the lockbox and appliances with no install year", () => {
  const units = [
    {
      id: "u1",
      label: "Lower",
      lockboxCode: "",
      utilities: doneUtilities,
      equipment: [{ type: "Furnace", installYear: "~2004" }, { type: "Oven", installYear: "" }, { type: "HVAC", installYear: "Newer" }],
    },
  ];
  const g = run({ properties: [property({ units })] }).gaps;
  assert.deepEqual(
    g.map((x) => [x.check, x.note]),
    [
      ["unit.lockbox", null],
      ["unit.installYears", "2 appliances"],
    ],
  );
});

test("sold properties are left out", () => {
  assert.deepEqual(checks({ properties: [property({ status: "Sold", insuranceCarrier: null })] }), []);
});

test("W-9: required once they've worked this year, suggested otherwise (D7)", () => {
  assert.deepEqual(checks({ contacts: [contact({ hasW9: false })] }), ["required:contact.w9"]);
  assert.deepEqual(checks({ contacts: [contact({ hasW9: false, worked: false })] }), ["suggested:contact.w9"]);
  // Inactive: asked for nothing, unless they worked this year, and then only the W-9.
  assert.deepEqual(checks({ contacts: [contact({ hasW9: false, worked: false, active: false, email: null })] }), []);
  assert.deepEqual(checks({ contacts: [contact({ hasW9: false, active: false, email: null })] }), ["required:contact.w9"]);
  // A sign-up waiting for Keep isn't a contractor yet.
  assert.deepEqual(checks({ contacts: [contact({ hasW9: false, needsReview: true })] }), []);
  assert.deepEqual(checks({ contacts: [contact({ hasInsurance: false, email: " ", phone: null })] }), [
    "suggested:contact.insurance",
    "suggested:contact.email",
    "suggested:contact.phone",
  ]);
});

test("Doesn't apply moves a gap to skipped, with who and when (D3)", () => {
  const input = { properties: [property({ insuranceCarrier: null, insurancePolicyNo: null })] };
  const skip = { check: "insurance.carrier", subject: "property:p1", createdAt: "2026-11-15T15:00:00Z", by: "Connor" };
  const out = run({ ...input, skips: [skip] });
  assert.deepEqual(out.gaps.map((g) => g.check), ["insurance.policy"]);
  assert.equal(out.skipped.length, 1);
  assert.equal(out.skipped[0].key, gapKey("insurance.carrier", "property:p1"));
  assert.equal(out.skipped[0].skippedBy, "Connor");
});

test("groups come by street, then contractors by name; places and section counts", () => {
  const out = run({
    properties: [
      property({ id: "p2", address: "767 Prospect Avenue, Buffalo, NY", insuranceCarrier: null }),
      property({ id: "p1", address: "118 Congress St. Buffalo, NY", insuranceCarrier: null, loanServicer: null }),
    ],
    contacts: [contact({ id: "c2", fullName: "Tony Bell", hasW9: false }), contact({ id: "c1", fullName: "Amy Ace", hasW9: false })],
  });
  assert.deepEqual(
    groupGaps(out.gaps).map((g) => g.group.label),
    ["118 Congress St.", "767 Prospect Avenue", "Amy Ace", "Tony Bell"],
  );
  assert.equal(placesLine(out.gaps), "2 properties, 2 contractors");
  assert.equal(placesLine(out.gaps.slice(0, 1)), "1 property");
  assert.deepEqual(sectionCounts(out.gaps.filter((g) => g.group.id === "p1")), { insurance: 1, loan: 1 });
});

test("a property fact opens its field's editor", () => {
  const [g] = run({ properties: [property({ insuranceRenewalDate: null })] }).gaps;
  assert.equal(g.href, "/properties/p1?fill=insuranceRenewalDate");
  assert.equal(g.field, "insuranceRenewalDate");
  assert.deepEqual(g.answer, { kind: "open", verb: "Set date" });
});

test("Make task: a title and one item per row, still-open rows only, in worklist order", () => {
  const out = run({
    properties: [property({ insuranceCarrier: null, units: [{ id: "u1", label: "Lower", lockboxCode: "1", utilities: { ...doneUtilities, waterAcct: "" } }] })],
    contacts: [contact({ hasW9: false })],
  });
  const [carrier, water, w9] = out.gaps;
  const one = taskFillOf(out.gaps, [water.key, carrier.key, "gone|property:p9"])!;
  assert.equal(one.title, "Fill in 2 items at 118 Congress St.");
  assert.deepEqual(one.items, ["Insurance carrier", "Lower · Buffalo Water account"]);
  assert.deepEqual(one.keys, [carrier.key, water.key]);
  assert.equal(one.propertyId, "p1");
  const both = taskFillOf(out.gaps, [carrier.key, w9.key])!;
  assert.equal(both.title, "Fill in 2 items of missing info");
  assert.deepEqual(both.items, ["118 Congress St. · Insurance carrier", "Zack Reading · W-9"]);
  assert.equal(both.propertyId, null);
  assert.equal(taskFillOf(out.gaps, [w9.key])!.title, "Fill in 1 item for Zack Reading");
  assert.equal(taskFillOf(out.gaps, ["gone|property:p9"]), null);
});

test("a tenant on two live leases has one email row", () => {
  const dana = { primary: true, tenant: { id: "n1", fullName: "Dana Fox", phone: "716", email: null } };
  const now = lease({ id: "l1", tenants: [dana] });
  const next = lease({ id: "l2", unitId: "u2", unitLabel: "Upper", movesIn: "2027-03-01", tenants: [dana] });
  const units = [
    { id: "u1", label: "Lower", lockboxCode: "1", utilities: doneUtilities },
    { id: "u2", label: "Upper", lockboxCode: "1", utilities: doneUtilities },
  ];
  const g = run({ properties: [property({ units, leases: [now, next] })] }).gaps;
  assert.deepEqual(
    g.map((x) => [x.check, x.label]),
    [["tenant.email", "Dana Fox's email"]],
  );
});

test("settling: an item ticks once its row is filled in, skipped or gone; a plain item never does", () => {
  const open = [
    { id: "a", checkKey: "insurance.carrier|property:p1" },
    { id: "b", checkKey: "insurance.policy|property:p1" },
    { id: "c", checkKey: null },
  ];
  const stillMissing = [{ key: "insurance.policy|property:p1" }];
  assert.deepEqual(
    itemsToSettle(open, stillMissing).map((i) => i.id),
    ["a"],
  );
  assert.deepEqual(
    itemsToSettle(open, []).map((i) => i.id),
    ["a", "b"],
  );
});
