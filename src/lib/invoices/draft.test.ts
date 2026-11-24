import test from "node:test";
import assert from "node:assert/strict";
import type { Ymd } from "@/lib/dates";
import { draftChanges, isDirty, savedValues, totalText, type Draft } from "./draft";

const day = "2026-11-20" as Ymd;
const base: Draft = {
  values: { contactId: "c1", invoiceNumber: "1043", invoiceDate: day, total: "850.00", note: "Roof" },
  jobs: [
    { linkId: "l1", taskId: "t1" },
    { linkId: "l2", taskId: null },
  ],
};
const edit = (v: Partial<Draft["values"]>, jobs = base.jobs): Draft => ({ values: { ...base.values, ...v }, jobs });

test("an untouched draft changes nothing", () => {
  assert.equal(draftChanges(base, edit({})), null);
  assert.equal(isDirty(base, edit({})), false);
});

test("the same value written another way is no change", () => {
  assert.equal(draftChanges(base, edit({ invoiceNumber: " #1043 ", total: "$850", note: "Roof \n" })), null);
});

test("only the fields that moved are in the patch", () => {
  const c = draftChanges(base, edit({ contactId: "c2", total: "1,043.10", note: "" }));
  assert.deepEqual(c, { patch: { contactId: "c2", total: "1,043.10", note: null }, link: [], unlink: [] });
});

test("a cleared number or total goes as null", () => {
  assert.deepEqual(draftChanges(base, edit({ invoiceNumber: "  ", total: "" }))?.patch, { invoiceNumber: null, total: null });
});

test("a date change is a change, and a missing date never is", () => {
  assert.deepEqual(draftChanges(base, edit({ invoiceDate: "2026-11-21" as Ymd }))?.patch, { invoiceDate: "2026-11-21" });
  assert.equal(draftChanges(base, edit({ invoiceDate: null })), null);
});

test("a total that can't be read still counts, so Save can say why", () => {
  assert.deepEqual(draftChanges(base, edit({ total: "abc" }))?.patch, { total: "abc" });
});

test("jobs added and removed come out by job, or by link for a deleted job", () => {
  const jobs = [{ linkId: "t9", taskId: "t9" }];
  assert.deepEqual(draftChanges(base, edit({}, jobs)), {
    patch: {},
    link: ["t9"],
    unlink: [{ taskId: "t1" }, { linkId: "l2" }],
  });
});

test("a job taken off and put back is no change", () => {
  assert.equal(draftChanges(base, edit({}, [...base.jobs])), null);
  // Put back with a new row id: the job is the same job.
  assert.equal(draftChanges(base, edit({}, [{ linkId: "t1", taskId: "t1" }, base.jobs[1]])), null);
});

test("an optimistic link id doesn't read as a new job once the real one arrives", () => {
  const saved: Draft = { ...base, jobs: [{ linkId: "real", taskId: "t1" }] };
  assert.equal(draftChanges(saved, { ...saved, jobs: [{ linkId: "t1", taskId: "t1" }] }), null);
});

test("savedValues reads back as the page shows it", () => {
  assert.deepEqual(savedValues({ contactId: null, invoiceNumber: "# 7", invoiceDate: null, total: "1043.1", note: " hi " }), {
    contactId: null,
    invoiceNumber: "7",
    invoiceDate: null,
    total: "1,043.10",
    note: "hi",
  });
  assert.equal(totalText(null), "");
});
