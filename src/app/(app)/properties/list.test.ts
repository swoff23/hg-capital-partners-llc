import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVED,
  DEFAULT_PROPERTY_SORT,
  NO_STATUS,
  PROPERTY_SORT_CHOICES,
  filterByStatus,
  isPropertyListFiltered,
  listTotals,
  parsePropertyFilters,
  propertySortPhrase,
  sortProperties,
  statusOptions,
} from "./list";

const ROWS = [
  { id: "oxford118", address: "118 Oxford Ave, Buffalo, NY 14209", value: 410_000, units: 3, status: "Stabilized" },
  { id: "oxford15", address: "15 Oxford Ave, Buffalo, NY 14209", value: 250_000, units: 2, status: "Rehabbing" },
  { id: "congress", address: "118 Congress St. Buffalo, NY 14213", value: null, units: null, status: null },
  { id: "tamarack", address: "56 Tamarack St, Buffalo, NY 14209", value: "310000.00", units: 4, status: "Stabilized" },
  { id: "mariner", address: "58 Mariner Street, Buffalo, NY 14201", value: 90_000, units: 4, status: "Sold" },
];
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

test("sort by Property is street, then house number: 15 comes before 118", () => {
  assert.deepEqual(ids(sortProperties(ROWS, "address")), ["congress", "mariner", "oxford15", "oxford118", "tamarack"]);
  // A string sort would put 118 Oxford before 15 Oxford.
  const oxford = ids(sortProperties(ROWS, "address")).filter((id) => id.startsWith("oxford"));
  assert.deepEqual(oxford, ["oxford15", "oxford118"]);
  assert.deepEqual(ids(sortProperties(ROWS, "-address")), ["tamarack", "oxford118", "oxford15", "mariner", "congress"]);
});

test("sort by Value: the figure either way, and a property with none goes last either way", () => {
  assert.deepEqual(ids(sortProperties(ROWS, "-value")), ["oxford118", "tamarack", "oxford15", "mariner", "congress"]);
  assert.deepEqual(ids(sortProperties(ROWS, "value")), ["mariner", "oxford15", "tamarack", "oxford118", "congress"]);
});

test("sort by Units: equal counts keep street order, and no count goes last", () => {
  assert.deepEqual(ids(sortProperties(ROWS, "-units")), ["mariner", "tamarack", "oxford118", "oxford15", "congress"]);
  assert.deepEqual(ids(sortProperties(ROWS, "units")), ["oxford15", "oxford118", "mariner", "tamarack", "congress"]);
});

test("sorting never changes the rows it is given", () => {
  const before = ids(ROWS);
  sortProperties(ROWS, "-value");
  assert.deepEqual(ids(ROWS), before);
});

test("parsePropertyFilters: Address is the default sort, statuses are comma-joined", () => {
  assert.deepEqual(parsePropertyFilters({}), { statuses: [], sort: DEFAULT_PROPERTY_SORT });
  assert.deepEqual(parsePropertyFilters({ status: "Sold,none", sort: "-value" }), { statuses: ["Sold", "none"], sort: "-value" });
});

test("status options: lifecycle order first, then typed ones, 'No status' last, each with its count", () => {
  const options = statusOptions([...ROWS.map((r) => r.status), "Zoning hold", "Zoning hold"]);
  assert.deepEqual(
    options.map((o) => [o.key, o.label, o.count]),
    [
      ["Rehabbing", "Rehabbing", 1],
      ["Stabilized", "Stabilized", 2],
      ["Sold", "Sold", 1],
      ["Zoning hold", "Zoning hold", 2],
      [NO_STATUS, "No status", 1],
    ],
  );
  assert.deepEqual(statusOptions(["Hold", " Hold "]).map((o) => o.count), [2], "stray spaces don't make a second status");
});

test("the Status filter keeps the picked ones, and 'none' keeps the properties with no status", () => {
  assert.deepEqual(ids(filterByStatus(ROWS, ["Stabilized"])), ["oxford118", "tamarack"]);
  assert.deepEqual(ids(filterByStatus(ROWS, ["Sold", NO_STATUS])), ["congress", "mariner"]);
  assert.equal(filterByStatus(ROWS, []).length, ROWS.length);
});

test("sort phrases: the phone's sheet reads each sort as a sentence", () => {
  assert.deepEqual(
    PROPERTY_SORT_CHOICES.map((c) => c.label),
    ["Address A to Z", "Value, high to low", "Value, low to high", "Most units"],
  );
  assert.equal(propertySortPhrase("-units"), "Most units");
  assert.equal(propertySortPhrase("-address"), "Address Z to A");
  assert.equal(propertySortPhrase("nonsense"), null);
});

test("the list is plain only in its opening state", () => {
  assert.equal(isPropertyListFiltered({ statuses: [], sort: DEFAULT_PROPERTY_SORT }), false);
  assert.equal(isPropertyListFiltered({ statuses: ["Sold"], sort: DEFAULT_PROPERTY_SORT }), true);
  assert.equal(isPropertyListFiltered({ statuses: [], sort: "-value" }), true);
});

const T = (status: string | null, units: number | null, value: unknown, over: { openTasks?: number; purchase?: unknown } = {}) => ({
  status,
  units,
  value,
  openTasks: over.openTasks ?? 0,
  purchase: over.purchase ?? null,
});

test("listTotals: the owned rows, labelled 'owned' once one of the rows has sold", () => {
  const rows = [T("Stabilized", 3, "410000.00", { openTasks: 2, purchase: 300_000 }), T(null, null, null), T("Sold", 2, 250_000)];
  assert.deepEqual(listTotals(rows), { label: "2 owned", count: 2, units: 3, openTasks: 2, purchase: 300_000, value: 410_000 });
  assert.equal(listTotals(rows.slice(0, 2)).label, "2 properties");
  assert.equal(listTotals(rows.slice(0, 1)).label, "1 property");
});

test("listTotals: under the Sold filter the footer totals the sold rows it sits under", () => {
  // The tester's /properties?status=Sold: one Sold row with 2 units and $250,000 read "0 owned 0 0 $0 $0".
  const sold = [T("Sold", 2, "250000.00", { purchase: "180000.00" })];
  assert.deepEqual(listTotals(sold), { label: "1 sold", count: 1, units: 2, openTasks: 0, purchase: 180_000, value: 250_000 });
  assert.equal(listTotals([...sold, T("sold", 1, 90_000)]).label, "2 sold");
  assert.deepEqual(listTotals([]), { label: "0 properties", count: 0, units: 0, openTasks: 0, purchase: 0, value: 0 });
});

test("listTotals: an archived row is in no count or sum, even under the Archived pick", () => {
  const live = T("Stabilized", 3, 410_000, { openTasks: 2, purchase: 300_000 });
  const archived = { ...T("Rehabbing", 4, 900_000, { openTasks: 5, purchase: 700_000 }), archived: true };
  assert.deepEqual(listTotals([live, archived]), listTotals([live]), "the archived row adds nothing");
  assert.equal(listTotals([live, archived]).label, "1 property", "and doesn't turn the label into 'owned'");
  assert.equal(listTotals([{ ...T("Sold", 2, 250_000), archived: true }, T("Sold", 1, 90_000)]).label, "1 sold");
  assert.deepEqual(listTotals([archived]), { label: "0 properties", count: 0, units: 0, openTasks: 0, purchase: 0, value: 0 });
});

test("Archived is the Status chip's last pick, with its count, once a property is archived", () => {
  const options = statusOptions(["Rehabbing", null], 2);
  assert.deepEqual(
    options.map((o) => [o.key, o.label, o.count]),
    [
      ["Rehabbing", "Rehabbing", 1],
      [NO_STATUS, "No status", 1],
      [ARCHIVED, "Archived", 2],
    ],
  );
  assert.ok(!statusOptions(["Rehabbing"]).some((o) => o.key === ARCHIVED), "no Archived pick while none is");
});

test("an archived property is on the list only while Archived is picked", () => {
  const rows = [
    ...ROWS.map((r) => ({ ...r, archived: false })),
    { id: "qa", address: "QA Test Oct27 Portfolio 1 Apt 4b", value: 1, units: 1, status: "Rehabbing", archived: true },
  ];
  assert.ok(!ids(filterByStatus(rows, [])).includes("qa"), "no picks: every live one, never an archived one");
  assert.equal(filterByStatus(rows, []).length, ROWS.length);
  assert.ok(!ids(filterByStatus(rows, ["Rehabbing"])).includes("qa"), "a status pick never reaches an archived one");
  assert.deepEqual(ids(filterByStatus(rows, [ARCHIVED])), ["qa"]);
  assert.deepEqual(ids(filterByStatus(rows, ["Rehabbing", ARCHIVED])), ["oxford15", "qa"]);
});
