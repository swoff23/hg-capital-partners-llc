import test from "node:test";
import assert from "node:assert/strict";
import {
  autoMatchClass,
  buildPropertyIndex,
  looksLikeProperty,
  parseClassName,
  propertyTokens,
} from "./mapping";

// The 11 real Property rows (address + id).
const PROPERTIES = [
  { id: "p_congress", address: "118 Congress St. Buffalo, NY 14213" },
  { id: "p_oxford", address: "15 Oxford Ave. Buffalo, NY 14209" },
  { id: "p_sherwood", address: "23 Sherwood St, Buffalo, NY 14213" },
  { id: "p_crescent", address: "415 Crescent Ave., Buffalo, NY 14214" },
  { id: "p_normal", address: "428 Normal Avenue, Buffalo, NY 14213" },
  { id: "p_mariner", address: "58 Mariner Street, Buffalo, NY 14201" },
  { id: "p_647", address: "647 Prospect Ave. Buffalo, NY 14213" },
  { id: "p_linwood", address: "725 Linwood Avenue, Buffalo, NY 14209" },
  { id: "p_765", address: "765 Prospect Avenue, Buffalo, NY 14213" },
  { id: "p_767", address: "767 Prospect Avenue, Buffalo, NY 14213" },
  { id: "p_lafayette", address: "933 Lafayette Avenue Buffalo, NY 14209" },
];

const idx = buildPropertyIndex(PROPERTIES);

test("parseClassName splits entity prefix from the leaf", () => {
  assert.deepEqual(parseClassName("HGC:HGC 15 Oxford"), { entityCode: "HGC", remainder: "15 Oxford" });
  assert.deepEqual(parseClassName("HG MGMT:HG MGMT 933 Lafayette"), {
    entityCode: "HG MGMT",
    remainder: "933 Lafayette",
  });
  assert.deepEqual(parseClassName("HGC"), { entityCode: "HGC", remainder: "" });
  assert.deepEqual(parseClassName("HG1:HG1 General"), { entityCode: "HG1", remainder: "General" });
  assert.deepEqual(parseClassName("BMK 58M"), { entityCode: "BMK", remainder: "58M" });
});

test("all 11 property-class families auto-match, with no manual mapping", () => {
  const cases: [string, string][] = [
    ["HGC:HGC 118 Congress", "p_congress"],
    ["HGC:HGC 15 Oxford", "p_oxford"],
    ["HG2:HG2 15 Oxford", "p_oxford"],
    ["HG MGMT:HG MGMT 15 Oxford", "p_oxford"],
    ["HG2:HG2 23 Sherwood", "p_sherwood"],
    ["HGC:HGC 415 Crescent", "p_crescent"],
    ["HG2:HG2 415 Crescent", "p_crescent"],
    ["HG MGMT:HG MGMT 415 Crescent", "p_crescent"],
    ["HG1:HG1 428 Normal", "p_normal"],
    ["HG MGMT:HG MGMT 428 Normal", "p_normal"],
    ["BMK 58M", "p_mariner"],
    ["HG1:HG1 647 Prospect", "p_647"],
    ["HG MGMT:HG MGMT 647 Prospect", "p_647"],
    ["HGC:HGC 725 Linwood", "p_linwood"],
    ["HGC:HGC 765 Prospect", "p_765"],
    ["HGC:HGC 767 Prospect", "p_767"],
    ["HG MGMT:HG MGMT 767 Prospect", "p_767"],
    ["HGC:HGC 933 Lafayette", "p_lafayette"],
    ["HG1:HG1 933 Lafayette", "p_lafayette"],
    ["HG MGMT:HG MGMT 933 Lafayette", "p_lafayette"],
  ];
  for (const [fqn, expectedId] of cases) {
    const m = autoMatchClass(fqn, idx);
    assert.equal(m.role, "PROPERTY", `${fqn} should be PROPERTY (${m.note})`);
    assert.equal(m.propertyId, expectedId, `${fqn} -> ${expectedId}`);
  }
});

test("765 / 767 / 647 Prospect do not collide", () => {
  assert.equal(autoMatchClass("HGC:HGC 765 Prospect", idx).propertyId, "p_765");
  assert.equal(autoMatchClass("HGC:HGC 767 Prospect", idx).propertyId, "p_767");
  assert.equal(autoMatchClass("HG1:HG1 647 Prospect", idx).propertyId, "p_647");
});

test("bare entity classes -> ENTITY, '* General' -> OVERHEAD", () => {
  for (const code of ["HGC", "HG1", "HG2", "HG MGMT"]) {
    const m = autoMatchClass(code, idx);
    assert.equal(m.role, "ENTITY");
    assert.equal(m.entityCode, code);
    assert.equal(m.propertyId, null);
  }
  for (const fqn of ["HGC:HGC General", "HG1:HG1 General", "HG2:HG2 General"]) {
    const m = autoMatchClass(fqn, idx);
    assert.equal(m.role, "OVERHEAD", fqn);
    assert.equal(m.propertyId, null);
  }
});

test("an unknown property leaf -> UNMAPPED, entity still captured", () => {
  const m = autoMatchClass("HG3:HG3 100 Elmwood", idx);
  assert.equal(m.role, "UNMAPPED");
  assert.equal(m.propertyId, null);
});

test("looksLikeProperty flags a new refi class for a known property", () => {
  const tokens = propertyTokens(PROPERTIES);
  // A future refi moves 15 Oxford into a new HG3 entity -> class arrives UNMAPPED.
  assert.equal(looksLikeProperty("HG3:HG3 15 Oxford", tokens), true);
  assert.equal(looksLikeProperty("HGC:HGC General", tokens), false);
  assert.equal(looksLikeProperty("HG3:HG3 100 Elmwood", tokens), false);
});

test("the property index is injective across the 11 properties", () => {
  assert.equal(idx.size, PROPERTIES.length);
});
