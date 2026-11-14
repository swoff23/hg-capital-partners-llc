import test from "node:test";
import assert from "node:assert/strict";
import { EMAIL_INVALID, PHONE_INVALID } from "@/lib/contractors/contact-fields";
import {
  DATE_INVALID,
  ENDS_BEFORE_START,
  MOVE_OUT_BEFORE_IN,
  RENT_REQUIRED,
  STARTS_REQUIRED,
  SUBSIDY_OVER_RENT,
  TENANT_NAME_REQUIRED,
  readDeposit,
  readStay,
  readTenant,
  readTerm,
  tenantShare,
} from "./fields";

test("readTenant new: the name is required; phone reads like a contractor's; blanks are null", () => {
  assert.deepEqual(readTenant({ fullName: "  Dana   Lee ", phone: "(716) 555 1234", email: " Dana@Example.com ", emergencyName: "", notes: "" }, "new"), {
    ok: true,
    data: { fullName: "Dana Lee", phone: "716-555-1234", phoneE164: "+17165551234", email: "dana@example.com", emergencyName: null, notes: null },
  });
  assert.deepEqual(readTenant({ phone: "716-555-1234" }, "new"), { ok: false, problems: { fullName: TENANT_NAME_REQUIRED } });
  assert.deepEqual(readTenant({ fullName: "Sam" }, "new"), { ok: true, data: { fullName: "Sam" } }, "no phone is fine (call 2)");
});

test("readTenant: every problem comes back, by field", () => {
  const r = readTenant({ fullName: " ", phone: "555", email: "nope", emergencyPhone: "12" }, "new");
  assert.deepEqual(r, { ok: false, problems: { fullName: TENANT_NAME_REQUIRED, phone: PHONE_INVALID, email: EMAIL_INVALID, emergencyPhone: PHONE_INVALID } });
});

test("readTenant patch: only the fields present; clearing the phone clears both columns", () => {
  assert.deepEqual(readTenant({ phone: "" }, "patch"), { ok: true, data: { phone: null, phoneE164: null } });
  assert.deepEqual(readTenant({ emergencyPhone: "716 555 0000 (mom)" }, "patch"), { ok: true, data: { emergencyPhone: "716-555-0000 (mom)" } });
  assert.deepEqual(readTenant({ fullName: "" }, "patch"), { ok: false, problems: { fullName: TENANT_NAME_REQUIRED } });
});

test("readStay: dates read as days; move-out must come after move-in, checked against what's stored", () => {
  assert.deepEqual(readStay({ movesIn: "2025-03-01", movesOut: "" }), { ok: true, data: { movesIn: "2025-03-01", movesOut: null } });
  assert.deepEqual(readStay({ movesIn: "2025-03-01", movesOut: "2025-03-01" }), { ok: false, problems: { movesOut: MOVE_OUT_BEFORE_IN } });
  assert.deepEqual(readStay({ movesOut: "2025-01-01" }, { movesIn: "2025-03-01", movesOut: null }), { ok: false, problems: { movesOut: MOVE_OUT_BEFORE_IN } });
  assert.deepEqual(readStay({ movesIn: "2027-01-01" }, { movesIn: "2025-03-01", movesOut: "2026-01-31" }), { ok: false, problems: { movesIn: MOVE_OUT_BEFORE_IN } });
  assert.deepEqual(readStay({ movesIn: "Feb 31" }), { ok: false, problems: { movesIn: DATE_INVALID } });
  assert.deepEqual(readStay({}), { ok: true, data: {} });
});

test("readTerm: start and rent required; end after start; the share at most the rent", () => {
  assert.deepEqual(readTerm({ startsOn: "2026-03-01", endsOn: "2027-02-28", rent: "$1,900", subsidy: "1500", subsidyFrom: " BMHA " }), {
    ok: true,
    data: { startsOn: "2026-03-01", endsOn: "2027-02-28", rent: "1900.00", subsidy: "1500.00", subsidyFrom: "BMHA" },
  });
  assert.deepEqual(readTerm({ startsOn: "2026-03-01", endsOn: "", rent: "1900", subsidy: "", subsidyFrom: "BMHA" }), {
    ok: true,
    data: { startsOn: "2026-03-01", endsOn: null, rent: "1900.00", subsidy: null, subsidyFrom: null },
  });
  assert.deepEqual(readTerm({ startsOn: "", rent: "" }), { ok: false, problems: { startsOn: STARTS_REQUIRED, rent: RENT_REQUIRED } });
  assert.deepEqual(readTerm({ startsOn: "2026-03-01", endsOn: "2026-02-28", rent: "0" }), { ok: false, problems: { endsOn: ENDS_BEFORE_START, rent: RENT_REQUIRED } });
  assert.deepEqual(readTerm({ startsOn: "2026-03-01", rent: "1900", subsidy: "2000" }), { ok: false, problems: { subsidy: SUBSIDY_OVER_RENT } });
  assert.equal(readTerm({ startsOn: "2026-03-01", rent: "a lot" }).ok, false);
});

test("readDeposit and tenantShare", () => {
  assert.deepEqual(readDeposit("1,900"), { ok: true, data: { deposit: "1900.00" } });
  assert.deepEqual(readDeposit(""), { ok: true, data: { deposit: null } });
  assert.equal(readDeposit("lots").ok, false);
  assert.equal(tenantShare("1900.00", "1500.00"), 400);
  assert.equal(tenantShare("1450.00", null), 1450);
});
