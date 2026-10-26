import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROPERTY_SORT,
  NO_STATUS,
  PROPERTY_SORT_CHOICES,
  filterByStatus,
  isPropertyListFiltered,
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
