import { addressKey, normalizeAddress } from "@/lib/normalize";
import { ENTITY_CODES } from "./entities";

/**
 * Class -> property / entity / role matching. Pure; covered by mapping.test.ts
 * against the real class list from the data spike.
 *
 * QBO classes are hierarchical: "HGC:HGC 15 Oxford" (parent = entity code,
 * child leaf = "{code} {property}"). We strip the entity prefix, reduce the
 * remainder with `addressKey`, and look it up in an index built from
 * `Property.address`.
 */

/** Short/nonstandard class remainders that aren't a "<number> <street-word>" token. */
export const CLASS_REMAINDER_ALIASES: Record<string, string> = {
  "58m": "58 mariner",
};

export type ClassRole = "PROPERTY" | "ENTITY" | "OVERHEAD" | "UNMAPPED";

export interface ParsedClassName {
  /** Entity code from the FQN prefix, e.g. "HGC", or null if none matched. */
  entityCode: string | null;
  /** Leaf text after the entity code; "" for a bare entity parent class. */
  remainder: string;
}

/** "HGC:HGC 15 Oxford" -> { entityCode: "HGC", remainder: "15 Oxford" }.  "HGC" -> { "HGC", "" }. */
export function parseClassName(fullyQualifiedName: string): ParsedClassName {
  const leaf = (fullyQualifiedName.split(":").pop() ?? "").trim();
  const code =
    ENTITY_CODES.find((c) => leaf === c || leaf.toLowerCase().startsWith(c.toLowerCase() + " ")) ??
    null;
  if (!code) return { entityCode: null, remainder: leaf };
  const remainder = leaf.slice(code.length).trim();
  return { entityCode: code, remainder };
}

export interface ClassMatch {
  role: ClassRole;
  entityCode: string | null;
  propertyId: string | null;
  note: string;
}

/** addressKey -> propertyId, from `prisma.property.findMany({ select: { id, address } })`. */
export function buildPropertyIndex(
  properties: { id: string; address: string }[],
): Map<string, string> {
  const idx = new Map<string, string>();
  for (const p of properties) {
    const key = addressKey(p.address);
    if (key && !idx.has(key)) idx.set(key, p.id);
  }
  return idx;
}

export function autoMatchClass(
  fullyQualifiedName: string,
  propertyIndex: Map<string, string>,
): ClassMatch {
  const { entityCode, remainder } = parseClassName(fullyQualifiedName);

  // 1. bare entity parent class ("HGC", "HG MGMT")
  if (remainder === "" && entityCode) {
    return { role: "ENTITY", entityCode, propertyId: null, note: `bare entity parent '${entityCode}'` };
  }

  // 2. entity "* General" bucket
  if (entityCode && /^general$/i.test(remainder)) {
    return {
      role: "OVERHEAD",
      entityCode,
      propertyId: null,
      note: `'${entityCode} General' entity overhead`,
    };
  }

  // 3. property leaf
  const lookup = remainder || fullyQualifiedName;
  const aliased = CLASS_REMAINDER_ALIASES[lookup.toLowerCase()] ?? lookup;
  const key = addressKey(aliased) || normalizeAddress(aliased);
  const propertyId = propertyIndex.get(key) ?? null;
  if (propertyId) {
    return {
      role: "PROPERTY",
      entityCode,
      propertyId,
      note: `'${remainder || fullyQualifiedName}' -> addressKey '${key}'`,
    };
  }

  // 4. no confident match — keep the entity so entity rollups stay complete
  return {
    role: "UNMAPPED",
    entityCode,
    propertyId: null,
    note: `no property for addressKey '${key}'`,
  };
}

/** Known property street-tokens, for the "looks like a property but is UNMAPPED" alarm. */
export function propertyTokens(properties: { address: string }[]): Set<string> {
  return new Set(properties.map((p) => addressKey(p.address)).filter(Boolean));
}

/**
 * True when an unmapped class name still contains a known property token — e.g. a
 * future refi creates "HG3:HG3 15 Oxford" with an entity prefix we don't know, so
 * the prefix isn't stripped, but "15 oxford" is right there. Drives the
 * data-quality alarm so a property's income is never silently dropped.
 */
export function looksLikeProperty(fullyQualifiedName: string, tokens: Set<string>): boolean {
  const n = normalizeAddress(fullyQualifiedName);
  for (const t of tokens) {
    if (t && n.includes(t)) return true;
  }
  return false;
}

/* ---------------- "Maps to": one decision per class ---------------- */

/** Every role a class can hold. `ClassRole` is what auto-matching can decide; a person can also ignore a class. */
export type StoredClassRole = ClassRole | "IGNORE";

/** What a class points at, as the mapping table stores it. */
export interface ClassTarget {
  role: StoredClassRole;
  propertyId: string | null;
  entityId: string | null;
}

/** One answer to "Maps to": a property, an entity, or one of the roles that has no target. */
export type MapsToPick =
  | { kind: "property"; propertyId: string }
  | { kind: "entity"; entityId: string }
  | { kind: "overhead" }
  | { kind: "ignore" }
  | { kind: "unmapped" };

const KEY_OVERHEAD = "OVERHEAD";
const KEY_IGNORE = "IGNORE";
const KEY_ENTITY = "ENTITY";

/**
 * The picker's key for what a class is mapped to now, or null for Unmapped
 * (the named empty choice). A property class names its property; one marked
 * as a property with none picked is unmapped, as the save treats it.
 */
export function mapsToKey(c: ClassTarget): string | null {
  switch (c.role) {
    case "PROPERTY":
      return c.propertyId ? `p:${c.propertyId}` : null;
    case "ENTITY":
      return c.entityId ? `e:${c.entityId}` : KEY_ENTITY;
    case "OVERHEAD":
      return KEY_OVERHEAD;
    case "IGNORE":
      return KEY_IGNORE;
    default:
      return null;
  }
}

/** A picker key back into a pick; null for a key that isn't one ("ENTITY" with no entity is only ever shown). */
export function parseMapsTo(key: string | null): MapsToPick | null {
  if (key === null) return { kind: "unmapped" };
  if (key === KEY_OVERHEAD) return { kind: "overhead" };
  if (key === KEY_IGNORE) return { kind: "ignore" };
  if (key.startsWith("p:") && key.length > 2) return { kind: "property", propertyId: key.slice(2) };
  if (key.startsWith("e:") && key.length > 2) return { kind: "entity", entityId: key.slice(2) };
  return null;
}

/**
 * The role and target a pick sets together. A property keeps the entity the
 * class's name gave it (the "HGC" in "HGC:HGC 15 Oxford"), which the entity
 * rollups read; picking an entity drops any property; a role with no target
 * drops the property and leaves the entity be.
 */
export function applyMapsTo(current: ClassTarget, pick: MapsToPick): ClassTarget {
  switch (pick.kind) {
    case "property":
      return { role: "PROPERTY", propertyId: pick.propertyId, entityId: current.entityId };
    case "entity":
      return { role: "ENTITY", propertyId: null, entityId: pick.entityId };
    case "overhead":
      return { role: "OVERHEAD", propertyId: null, entityId: current.entityId };
    case "ignore":
      return { role: "IGNORE", propertyId: null, entityId: current.entityId };
    case "unmapped":
      return { role: "UNMAPPED", propertyId: null, entityId: current.entityId };
  }
}

/** The class's own name in the table and toast: the leaf of "HGC:HGC 767 Prospect". */
export function classLeaf(fullyQualifiedName: string): string {
  return (fullyQualifiedName.split(":").pop() ?? fullyQualifiedName).trim() || fullyQualifiedName;
}

/** The toast after a pick: "Prospect mapped to 767 Prospect Ave", or "Prospect unmapped". */
export function mapsToMessage(className: string, targetName: string | null): string {
  return targetName ? `${classLeaf(className)} mapped to ${targetName}` : `${classLeaf(className)} unmapped`;
}
