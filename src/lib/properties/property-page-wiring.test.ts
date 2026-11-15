import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The property page's small calls (Nov 14), read from source as the repo's
 * other component wiring tests do: the table below 360, the Acct # line, the
 * tapped row while a sheet's code downloads, and the move-in switch's words.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const PAGE = "../../app/(app)/properties/[id]/";

test("Building CapEx below 360 drops the Status column and shows each row's status under its component", () => {
  const src = read(`${PAGE}building-capex.tsx`);
  assert.match(src, /const narrowHidden = "max-\[360px\]:hidden";/);
  assert.match(src, /<Th className=\{narrowHidden\}>Status<\/Th>/);
  assert.match(src, /<Td className=\{cn\("whitespace-nowrap align-middle", narrowHidden\)\}>\s*<EquipmentStatusText status=\{rs\.status\} \/>/);
  // Under the name, from 360 up it is gone again (the column shows it).
  assert.match(src, /<span className="mt-0\.5 block text-meta min-\[360px\]:hidden">\s*<EquipmentStatusText status=\{rs\.status\} \/>/);
  // The 480 drops are untouched.
  assert.match(src, /const phoneHidden = "max-\[480px\]:hidden";/);
});

test("a building system's save says it was saved and offers no Undo", () => {
  const src = read(`${PAGE}building-capex.tsx`);
  assert.match(src, /done: `\$\{item\.label\} saved`/);
  assert.doesNotMatch(src, /\bundo\b/i);
});

test("Acct # keeps one line and a long number wraps inside its column", () => {
  const src = read(`${PAGE}edit-units.tsx`);
  assert.match(src, /<dt className="shrink-0 whitespace-nowrap text-muted-foreground">\{label\}<\/dt>/);
  assert.match(src, /<Code value=\{v\} label=\{`\$\{g\.name\} account number`\} wrap className="min-w-0" \/>/);
  // A long unbroken number breaks inside the column instead of running past it at 320.
  assert.match(read("../../components/code.tsx"), /min-w-0 \[overflow-wrap:anywhere\]/);
});

test("a tapped unit or listing row takes the fill while its sheet's code downloads, read from the shared store", () => {
  for (const [file, sheet] of [
    ["edit-units.tsx", "unitSheet"],
    ["edit-listings.tsx", "listingSheet"],
  ] as const) {
    const src = read(`${PAGE}${file}`);
    // The store's answer, not the hook's: the hook only notices code that came in while idle one render after the tap.
    assert.match(src, new RegExp(`sheet !== null && !editor && ${sheet}\\.loaded\\(\\) === null \\? sheet : null`), `${file} reads the store`);
    assert.match(src, /sheetWaitingFill/, `${file} uses the shared fill`);
    assert.match(src, /<AddRow[^\n]*waiting=\{waitingFor !== null && waitingFor\.(at|listingId) === null\}/, `${file} marks the Add row too`);
  }
  const ui = read("../../components/ui.tsx");
  assert.match(ui, /export const sheetWaitingFill = "bg-muted";/);
  // The same fill a tapped link row gets.
  assert.match(ui, /export const pendingRowFill = "has-\[\[data-link-pending\]\]:bg-muted";/);
  assert.match(ui, /aria-busy=\{waiting \|\| undefined\}/);
  assert.match(ui, /waiting && cn\(sheetWaitingFill, "-mx-2 rounded-md border-transparent px-2"\),/);
  // The photo viewer is not part of this.
  assert.doesNotMatch(read("../../components/lightbox-lazy.tsx"), /sheetWaitingFill/);
});

test("a tapped unit equipment row takes the fill too while the unit sheet's code downloads", () => {
  const src = read(`${PAGE}edit-units.tsx`);
  // Its sheet comes in the same chunk as the unit's, so it reads the same store.
  assert.match(src, /const waitingItem = item !== null && !editor && unitSheet\.loaded\(\) === null \? item : null;/);
  // Both lists hand each unit the waiting item's place when it is theirs.
  assert.equal(src.match(/waitingItem=\{waitingItem !== null && waitingItem\.at === i \? waitingItem\.index : null\}/g)?.length, 2);
  // The tapped row, not the unit's name, says it's working.
  assert.match(src, /<tr\s+key=\{j\}\s+onClick=\{\(\) => onEditEquipment\(j\)\}\s+onPointerEnter=\{unitSheet\.warm\}\s+aria-busy=\{j === waitingItem \|\| undefined\}\s+className=\{cn\("transition-colors pointer-fine:cursor-pointer pointer-fine:hover:bg-muted", j === waitingItem && sheetWaitingFill\)\}/);
});

test("the move-in switch reads Shown and Hidden and keeps its label; Escrow keeps Yes and No", () => {
  const fact = read(`${PAGE}property-fact.tsx`);
  assert.match(fact, /<RailFact label="Move-in form">/);
  assert.match(fact, /words=\{\{ on: "Shown", off: "Hidden" \}\}/);
  const escrow = fact.slice(fact.indexOf("export function PropertyEscrow"), fact.indexOf("export function PropertyMoveInSwitch"));
  assert.doesNotMatch(escrow, /words=/);
  const field = read("../../components/inline-field.tsx");
  assert.match(field, /label=\{on \? \(props\.words\?\.on \?\? "Yes"\) : \(props\.words\?\.off \?\? "No"\)\}/);
});
