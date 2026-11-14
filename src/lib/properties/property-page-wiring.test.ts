import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The property page's small calls (Nov 14), read from source as the repo's
 * other component wiring tests do: the table below 360, Entity's suggestions,
 * the Acct # line, the tapped row while a sheet's code downloads, and the
 * move-in switch's words.
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

test("Entity in Details is a text fact with suggestions; the shared field renders a Combobox that takes a new value", () => {
  const details = read(`${PAGE}edit-details.tsx`);
  assert.match(details, /field="llcOwner" label="Entity" kind="text" suggestions=\{entities\}/);
  assert.match(details, /PropertyDetailsSection\(\{ property: p, entities \}/);
  const field = read("../../components/inline-field.tsx");
  assert.match(field, /const suggest = kind === "text" \? suggestions : undefined;/);
  // In place and in the touch sheet.
  assert.match(field, /<Combobox\s+aria-label=\{label\}\s+size="sm"\s+items=\{suggest\}\s+allowCustom\s+value=\{value\}\s+initialText=\{draft\}/);
  assert.match(field, /if \(suggest\) return <Combobox aria-label=\{label\} items=\{suggest\} allowCustom value=\{draft\} onChange=\{changed\} \/>;/);
  // Only a text fact that is given a list changes; Attorney and the rest don't.
  assert.doesNotMatch(details, /label="Attorney"[^\n]*suggestions/);
  // One Esc closes one layer: the open list first.
  assert.match(field, /if \(listOnScreen\(input\)\) return;/);
});

test("Acct # keeps one line and a long revealed number wraps inside its column", () => {
  const src = read(`${PAGE}edit-units.tsx`);
  assert.match(src, /<dt className="shrink-0 whitespace-nowrap text-fg-3">\{label\}<\/dt>/);
  assert.match(src, /<Code value=\{v\} label=\{`\$\{g\.name\} account number`\} mask wrap \/>/);
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
    assert.match(src, /waiting=\{/, `${file} marks the Add row too`);
  }
  const ui = read("../../components/ui.tsx");
  assert.match(ui, /export const sheetWaitingFill = "bg-fill-1";/);
  // The same fill a tapped link row gets.
  assert.match(ui, /export const pendingRowFill = "has-\[\[data-link-pending\]\]:bg-fill-1";/);
  assert.match(ui, /aria-busy=\{waiting \|\| undefined\}/);
  assert.match(ui, /waiting && cn\(sheetWaitingFill, "-mx-2 rounded-md border-transparent px-2"\),/);
  // The photo viewer is not part of this.
  assert.doesNotMatch(read("../../components/lightbox-lazy.tsx"), /sheetWaitingFill/);
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
