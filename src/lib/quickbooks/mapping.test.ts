import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMapsTo,
  autoMatchClass,
  buildPropertyIndex,
  classLeaf,
  looksLikeProperty,
  mapsToKey,
  mapsToMessage,
  parseClassName,
  parseMapsTo,
  propertyTokens,
  type ClassTarget,
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

// ---------------------------------------------------------------------------
// "Maps to": one pick sets the role and the target together
// ---------------------------------------------------------------------------

const propertyClass: ClassTarget = { role: "PROPERTY", propertyId: "p_767", entityId: "e_hgc" };

test("mapsToKey: what a class is mapped to now, as the picker's key", () => {
  assert.equal(mapsToKey(propertyClass), "p:p_767");
  assert.equal(mapsToKey({ role: "ENTITY", propertyId: null, entityId: "e_hgc" }), "e:e_hgc");
  assert.equal(mapsToKey({ role: "OVERHEAD", propertyId: null, entityId: "e_hgc" }), "OVERHEAD");
  assert.equal(mapsToKey({ role: "IGNORE", propertyId: null, entityId: null }), "IGNORE");
  assert.equal(mapsToKey({ role: "UNMAPPED", propertyId: null, entityId: null }), null, "Unmapped is the empty choice");
  assert.equal(mapsToKey({ role: "PROPERTY", propertyId: null, entityId: null }), null, "a property role with no property is unmapped");
  assert.equal(mapsToKey({ role: "ENTITY", propertyId: null, entityId: null }), "ENTITY", "an entity role with none picked still shows");
});

test("parseMapsTo: the picker's keys back into picks", () => {
  assert.deepEqual(parseMapsTo("p:p_767"), { kind: "property", propertyId: "p_767" });
  assert.deepEqual(parseMapsTo("e:e_hgc"), { kind: "entity", entityId: "e_hgc" });
  assert.deepEqual(parseMapsTo("OVERHEAD"), { kind: "overhead" });
  assert.deepEqual(parseMapsTo("IGNORE"), { kind: "ignore" });
  assert.deepEqual(parseMapsTo(null), { kind: "unmapped" });
  assert.equal(parseMapsTo("p:"), null);
  assert.equal(parseMapsTo("ENTITY"), null);
  assert.equal(parseMapsTo("whatever"), null);
});

test("Maps to a property sets the role and the property together, and keeps the class's entity", () => {
  const was: ClassTarget = { role: "UNMAPPED", propertyId: null, entityId: "e_hgc" };
  assert.deepEqual(applyMapsTo(was, { kind: "property", propertyId: "p_767" }), {
    role: "PROPERTY",
    propertyId: "p_767",
    entityId: "e_hgc",
  });
  // The old three-step way left a property behind when the role changed; one pick can't.
  assert.deepEqual(applyMapsTo(propertyClass, { kind: "property", propertyId: "p_765" }).propertyId, "p_765");
});

test("Maps to an entity sets the role and the entity together, and drops the property", () => {
  assert.deepEqual(applyMapsTo(propertyClass, { kind: "entity", entityId: "e_mgmt" }), {
    role: "ENTITY",
    propertyId: null,
    entityId: "e_mgmt",
  });
});

test("Maps to Overhead, Ignore or Unmapped sets the role and clears the property", () => {
  for (const [pick, role] of [
    [{ kind: "overhead" }, "OVERHEAD"],
    [{ kind: "ignore" }, "IGNORE"],
    [{ kind: "unmapped" }, "UNMAPPED"],
  ] as const) {
    assert.deepEqual(applyMapsTo(propertyClass, pick), { role, propertyId: null, entityId: "e_hgc" });
  }
});

test("a pick read back from its own key is the same pick: Undo can put the old mapping back", () => {
  for (const c of [
    propertyClass,
    { role: "ENTITY", propertyId: null, entityId: "e_hgc" },
    { role: "OVERHEAD", propertyId: null, entityId: "e_hgc" },
    { role: "IGNORE", propertyId: null, entityId: null },
    { role: "UNMAPPED", propertyId: null, entityId: null },
  ] as ClassTarget[]) {
    const pick = parseMapsTo(mapsToKey(c));
    assert.ok(pick);
    assert.deepEqual(applyMapsTo(c, pick), c);
  }
});

test("the toast names the class by its own name", () => {
  assert.equal(classLeaf("HGC:HGC 767 Prospect"), "HGC 767 Prospect");
  assert.equal(classLeaf("Prospect"), "Prospect");
  assert.equal(mapsToMessage("Prospect", "767 Prospect Ave"), "Prospect mapped to 767 Prospect Ave");
  assert.equal(mapsToMessage("HGC:HGC 767 Prospect", null), "HGC 767 Prospect unmapped");
});
