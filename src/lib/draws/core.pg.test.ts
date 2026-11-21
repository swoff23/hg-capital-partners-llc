import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import {
  ALREADY_SET_UP,
  UNIT_NOT_HERE,
  APPROVED_NEEDED,
  DRAFT_EMPTY,
  FUNDED_NEEDED,
  LINE_ON_A_DRAW,
  overLineMessage,
  REHAB_DONE,
  addLine,
  advanceDraw,
  alreadyOpenMessage,
  createRehab,
  deleteLine,
  deleteRehab,
  importWorksheet,
  rehabName,
  restoreDrawStage,
  restoreLine,
  sendDraft,
  setDone,
  setDraftAmount,
  startDraft,
  unsendDraw,
  updateDraw,
} from "./core";

/**
 * The rehab and draw rules on a real Postgres (docs/specs/rehab-draws.md),
 * including the one-draft index the migration adds. Opt-in by the same guard
 * as src/lib/tenants/core.pg.test.ts: `npm test` skips it unless
 * HG_SCRATCH_DATABASE_URL names a local scratch database with the migrations
 * applied. It removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_draws_scratch npx tsx --test src/lib/draws/core.pg.test.ts
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

function isLocalScratch(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "postgresql:" &&
    url.username !== "" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    (url.port === "" || url.port === "5432") &&
    /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === ""
  );
}
const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";

let prisma: PrismaClient;
const made = scratchRows(() => prisma);
const run = randomUUID().slice(0, 8);
const rehabIds: string[] = [];

async function property(street: string, units: { id?: string; label: string }[] = []): Promise<string> {
  const p = await made.property({ address: `${street}, Buffalo, NY 14213 ${run}`, units });
  return p.id;
}

async function rehab(street: string, units: { id?: string; label: string }[] = []): Promise<string> {
  const r = await createRehab(prisma, { propertyIds: [await property(street, units)], lender: "Vontive" }, null);
  rehabIds.push(r.id);
  return r.id;
}

async function refusal(p: Promise<unknown>): Promise<Record<string, string>> {
  try {
    await p;
  } catch (err) {
    if (err instanceof FieldError) return err.fieldErrors as Record<string, string>;
    throw err;
  }
  assert.fail("expected a refusal");
}

const draws = (rehabId: string) => prisma.draw.findMany({ where: { rehabId }, orderBy: { number: "asc" }, include: { lines: true } });

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV, NODE_ENV: "test" } as never);
  await made.takeTurn(URL_ENV);
});

after(async () => {
  if (skip) return;
  // A rehab outlives its properties (their links cascade, it doesn't), so the rehabs go first.
  for (const id of rehabIds) await deleteRehab(prisma, id).catch(() => {});
  await made.remove();
  await prisma.$disconnect();
});

test("a rehab's name joins streets, folding a shared street", () => {
  assert.equal(rehabName(["765 Prospect Avenue, Buffalo, NY", "767 Prospect Avenue, Buffalo, NY"]), "765 and 767 Prospect Avenue");
  assert.equal(rehabName(["23 Sherwood Dr. Buffalo NY 14213"]), "23 Sherwood Dr.");
  assert.equal(rehabName(["1 A St", "2 B St", "3 C St"]), "1 A St, 2 B St and 3 C St");
});

test("one loan covers two properties, and neither can join a second open rehab", { skip }, async () => {
  const a = await property("765 Prospect Avenue");
  const b = await property("767 Prospect Avenue");
  const r = await createRehab(prisma, { propertyIds: [a, b], lender: "Vontive" }, null);
  rehabIds.push(r.id);
  const row = await prisma.rehab.findUniqueOrThrow({ where: { id: r.id }, include: { properties: true } });
  assert.equal(row.name, "765 and 767 Prospect Avenue");
  assert.equal(row.properties.length, 2);
  assert.deepEqual(await refusal(createRehab(prisma, { propertyIds: [b], lender: null }, null)), { propertyIds: alreadyOpenMessage("767 Prospect Avenue") });
});

test("the draft opens on its first amount, sends with its total, and Undo puts it back", { skip }, async () => {
  const id = await rehab("1 Draft St");
  const demo = await addLine(prisma, id, { unit: null, name: "Demo", original: 10000, changeOrder: 0 });
  const floors = await addLine(prisma, id, { unit: null, name: "Flooring", original: 2000, changeOrder: 500 });
  assert.deepEqual(await refusal(sendDraft(prisma, id, "2026-11-20")), { draft: DRAFT_EMPTY });

  await setDraftAmount(prisma, demo.id, 6000);
  await setDraftAmount(prisma, floors.id, 1200.45);
  await setDraftAmount(prisma, floors.id, null);
  await setDraftAmount(prisma, floors.id, 700.55);
  let all = await draws(id);
  assert.equal(all.length, 1);
  assert.equal(all[0].stage, "DRAFT");
  assert.equal(all[0].lines.length, 2);

  // Never past what's left on a line: Flooring is 2,500 revised, so 2,600 is refused.
  assert.deepEqual(await refusal(setDraftAmount(prisma, floors.id, 2600)), { draft: overLineMessage("Flooring", 2500) });
  const sent = await sendDraft(prisma, id, "2026-11-20");
  all = await draws(id);
  assert.equal(all[0].stage, "SENT");
  assert.equal(all[0].sentAmount?.toString(), "6700.55");

  // With 6,000 of Demo's 10,000 at the lender, the next draft can take 4,000 of it and no more.
  assert.deepEqual(await refusal(setDraftAmount(prisma, demo.id, 4000.01)), { draft: "Only $4,000 is left on Demo." });
  // A second draft opens beside the sent one; the partial index allows only one.
  await setDraftAmount(prisma, demo.id, 100);
  await assert.rejects(prisma.draw.create({ data: { rehabId: id, number: 99 } }));
  assert.deepEqual(await refusal(unsendDraw(prisma, sent.drawId)), { draw: "A new draft is open, so this one stays sent." });
  await setDraftAmount(prisma, demo.id, null);
  await prisma.draw.deleteMany({ where: { rehabId: id, stage: "DRAFT" } });
  await unsendDraw(prisma, sent.drawId);
  all = await draws(id);
  assert.equal(all[0].stage, "DRAFT");
  assert.equal(all[0].sentAmount, null);
});

test("Approved needs its amount and Funded what landed", { skip }, async () => {
  const id = await rehab("2 Stage St");
  const line = await addLine(prisma, id, { unit: null, name: "Electrical", original: 5000, changeOrder: 0 });
  await setDraftAmount(prisma, line.id, 4000);
  const { drawId } = await sendDraft(prisma, id, "2026-11-01");

  await updateDraw(prisma, drawId, { stage: "INSPECTION" }, "2026-11-05");
  assert.deepEqual(await refusal(updateDraw(prisma, drawId, { stage: "APPROVED" }, "2026-11-06")), { approvedAmount: APPROVED_NEEDED });
  await updateDraw(prisma, drawId, { stage: "APPROVED", approvedAmount: 3800 }, "2026-11-06");
  let d = await prisma.draw.findUniqueOrThrow({ where: { id: drawId } });
  assert.equal(d.approvedOn?.toISOString().slice(0, 10), "2026-11-06");

  assert.deepEqual(await refusal(updateDraw(prisma, drawId, { stage: "FUNDED" }, "2026-11-07")), { fundedAmount: FUNDED_NEEDED });
  await updateDraw(prisma, drawId, { stage: "FUNDED", fundedAmount: 3600 }, "2026-11-07");
  d = await prisma.draw.findUniqueOrThrow({ where: { id: drawId } });
  assert.equal(d.fundedOn?.toISOString().slice(0, 10), "2026-11-07");
});

test("a line on a sent draw stays; one only on the draft deletes and comes back with its amount", { skip }, async () => {
  const id = await rehab("3 Line St");
  const kept = await addLine(prisma, id, { unit: null, name: "Roof", original: 9000, changeOrder: 0 });
  const gone = await addLine(prisma, id, { unit: null, name: "Paint", original: 1000, changeOrder: 0 });
  await setDraftAmount(prisma, kept.id, 3000);
  await sendDraft(prisma, id, "2026-11-02");
  assert.deepEqual(await refusal(deleteLine(prisma, kept.id)), { line: LINE_ON_A_DRAW });

  await setDraftAmount(prisma, gone.id, 250);
  const snap = await deleteLine(prisma, gone.id);
  assert.equal(snap.draft, 250);
  assert.equal(await prisma.rehabLine.count({ where: { rehabId: id } }), 1);
  await restoreLine(prisma, snap);
  const back = await prisma.rehabLine.findFirstOrThrow({ where: { rehabId: id, name: "Paint" }, include: { amounts: true } });
  assert.equal(back.unitLabel, null);
  assert.equal(back.amounts[0]?.amount.toString(), "250");
});

test("a line's unit comes from the rehab's properties; a placeholder becomes the unit's lasting id", { skip }, async () => {
  const id = await rehab("6 Unit St", [{ label: "Lower" }, { label: "Upper" }, { label: "HSE (house)" }]);
  const [p] = (await prisma.rehabProperty.findMany({ where: { rehabId: id } })).map((r) => r.propertyId);
  const line = await addLine(prisma, id, { unit: { propertyId: p, unitId: "unit-at-1" }, name: "Flooring", original: 500, changeOrder: 0 });
  const row = await prisma.rehabLine.findUniqueOrThrow({ where: { id: line.id } });
  const units = (await prisma.property.findUniqueOrThrow({ where: { id: p } })).units as { id: string; label: string }[];
  assert.equal(row.unitLabel, "Upper");
  assert.equal(row.unitId, units[1].id);
  assert.ok(units.every((u) => u.id && !u.id.startsWith("unit-at-")));
  const other = await property("7 Elsewhere St", [{ id: "u-else", label: "Front" }]);
  assert.deepEqual(await refusal(addLine(prisma, id, { unit: { propertyId: other, unitId: "u-else" }, name: "X", original: 1, changeOrder: 0 })), { unit: UNIT_NOT_HERE });
});

test("a worksheet comes in once: lines, holdback and past draws as Funded without dates", { skip }, async () => {
  const id = await rehab("4 Upload St", [{ id: "u-lower", label: "Lower" }]);
  const [propertyId] = (await prisma.rehabProperty.findMany({ where: { rehabId: id } })).map((r) => r.propertyId);
  const read = {
    holdback: 12500.5,
    units: ["Unit 1", "Unit 2"],
    lines: [
      { unitLabel: "Unit 1", name: "Demolition", original: 4000, changeOrder: 0 },
      { unitLabel: "Unit 2", name: "Demolition", original: 4000, changeOrder: 500.5 },
      { unitLabel: "Unit 2", name: "Contingency", original: 4000, changeOrder: -4000 },
    ],
    draws: [
      { number: 1, amounts: [4000, 2000, 0] },
      { number: 2, amounts: [0, 2500.5, 0] },
    ],
  };
  assert.deepEqual(await importWorksheet(prisma, id, read, { "Unit 1": { propertyId, unitId: "u-lower" }, "Unit 2": null }), { lines: 3, draws: 2 });
  const r = await prisma.rehab.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  assert.equal(r.source, "WORKSHEET");
  assert.equal(r.holdback?.toString(), "12500.5");
  // Unit 1 matched to the property's Lower; Unit 2 left unmatched keeps the worksheet's words.
  assert.deepEqual(r.lines.map((l) => [l.unitId, l.unitLabel, l.name]), [["u-lower", "Lower", "Demolition"], [null, "Unit 2", "Demolition"], [null, "Unit 2", "Contingency"]]);
  const all = await draws(id);
  assert.deepEqual(all.map((d) => [d.number, d.stage, d.approvedAmount?.toString(), d.sentOn, d.lines.length]), [
    [1, "FUNDED", "6000", null, 2],
    [2, "FUNDED", "2500.5", null, 1],
  ]);
  assert.deepEqual(await refusal(importWorksheet(prisma, id, read)), { file: ALREADY_SET_UP });

  // Contingency was moved out, so nothing is left to draw on it.
  assert.deepEqual(await refusal(setDraftAmount(prisma, r.lines[2].id, 100)), { draft: overLineMessage("Contingency", 0) });
  // The next draft numbers on from the imported draws.
  const extra = await addLine(prisma, id, { unit: null, name: "Paint", original: 800, changeOrder: 0 });
  await setDraftAmount(prisma, extra.id, 100);
  assert.equal((await draws(id)).at(-1)?.number, 3);
});

test("a done rehab refuses changes until it's reopened", { skip }, async () => {
  const id = await rehab("5 Done St");
  await setDone(prisma, id, true);
  assert.deepEqual(await refusal(addLine(prisma, id, { unit: null, name: "Late", original: 1, changeOrder: 0 })), { rehab: REHAB_DONE });
  await setDone(prisma, id, false);
  await addLine(prisma, id, { unit: null, name: "Late", original: 1, changeOrder: 0 });
});

test("the next-step button moves a draw one stage at a time, and Undo puts it back exactly", { skip }, async () => {
  const id = await rehab("8 Step St");
  const line = await addLine(prisma, id, { unit: null, name: "Roof", original: 9000, changeOrder: 0 });
  await setDraftAmount(prisma, line.id, 5000);
  const { drawId } = await sendDraft(prisma, id, "2026-11-10");
  const sentAt = (await prisma.draw.findUniqueOrThrow({ where: { id: drawId } })).stageChangedAt;

  const toInspection = await advanceDraw(prisma, drawId, null, "2026-11-12");
  assert.equal(toInspection.stage, "INSPECTION");
  await restoreDrawStage(prisma, drawId, toInspection.before);
  const back = await prisma.draw.findUniqueOrThrow({ where: { id: drawId } });
  assert.equal(back.stage, "SENT");
  assert.equal(back.stageChangedAt.toISOString(), sentAt.toISOString());

  await advanceDraw(prisma, drawId, null, "2026-11-12");
  assert.deepEqual(await refusal(advanceDraw(prisma, drawId, null, "2026-11-14")), { amount: APPROVED_NEEDED });
  await advanceDraw(prisma, drawId, 4800, "2026-11-14");
  const funded = await advanceDraw(prisma, drawId, 4600, "2026-11-15");
  const d = await prisma.draw.findUniqueOrThrow({ where: { id: drawId } });
  assert.deepEqual([d.stage, d.approvedAmount?.toString(), d.approvedOn?.toISOString().slice(0, 10), d.fundedAmount?.toString(), d.fundedOn?.toISOString().slice(0, 10)], ["FUNDED", "4800", "2026-11-14", "4600", "2026-11-15"]);
  assert.deepEqual(await refusal(advanceDraw(prisma, drawId, 1, "2026-11-16")), { draw: "This draw is already funded." });
  await restoreDrawStage(prisma, drawId, funded.before);
  const undone = await prisma.draw.findUniqueOrThrow({ where: { id: drawId } });
  assert.deepEqual([undone.stage, undone.fundedAmount, undone.fundedOn], ["APPROVED", null, null]);
});

test("New draw opens the next draw once; a second tap hands back the same one", { skip }, async () => {
  const id = await rehab("9 Start St");
  const first = await startDraft(prisma, id);
  const again = await startDraft(prisma, id);
  assert.equal(first.number, 1);
  assert.equal(again.drawId, first.drawId);
});

