/**
 * The 5 LLCs in HG's QuickBooks company file. Seeded, not discovered — the QBO
 * "Business"/Department dimension is unreliable, but the class hierarchy always
 * carries the entity as the top-level (no-":") parent class.
 *
 * `code` matches the class prefix ("HGC 725 Linwood" -> "HGC"). `llcOwnerNames`
 * are the `Property.llcOwner` strings that resolve to this entity, used to show a
 * property's current holding entity.
 */
export interface QboEntitySeed {
  code: string;
  name: string;
  llcOwnerNames: string[];
  isJointVenture: boolean;
  sortOrder: number;
}

export const QBO_ENTITY_SEED: readonly QboEntitySeed[] = [
  {
    code: "HGC",
    name: "HG Capital Partners LLC",
    llcOwnerNames: ["HG Capital Partners LLC"],
    isJointVenture: false,
    sortOrder: 1,
  },
  {
    code: "HG1",
    name: "HG Buffalo Holding 1 LLC",
    llcOwnerNames: ["HG Buffalo Holding 1 LLC"],
    isJointVenture: false,
    sortOrder: 2,
  },
  {
    code: "HG2",
    name: "HG Buffalo Holding 2 LLC",
    llcOwnerNames: ["HG Buffalo Holding 2 LLC"],
    isJointVenture: false,
    sortOrder: 3,
  },
  {
    code: "HG MGMT",
    name: "HG Buffalo Property Management LLC",
    llcOwnerNames: ["HG Buffalo Property Management LLC"],
    isJointVenture: false,
    sortOrder: 4,
  },
  {
    code: "BMK",
    name: "BMK Property Group LLC",
    // 58 Mariner's Property.llcOwner is literally "1) 50% BK \n2) 50% HG Buffalo Holding 1 LLC"
    llcOwnerNames: ["BMK Property Group LLC", "50% BK", "50% HG Buffalo Holding 1 LLC"],
    isJointVenture: true,
    sortOrder: 5,
  },
] as const;

/** Entity codes longest-first, so "HG MGMT" is tried before "HG1"/"HG2"/"HGC". */
export const ENTITY_CODES: readonly string[] = [...QBO_ENTITY_SEED]
  .map((e) => e.code)
  .sort((a, b) => b.length - a.length);

/**
 * The companies a property can be held by, in their QuickBooks order: the
 * rows of the Entity picker on a property and on New property, and what the
 * property service accepts for `Property.llcOwner` (lib/properties/entity.ts).
 * A new LLC is added to `QBO_ENTITY_SEED` once, and shows up in both.
 */
export const ENTITY_NAMES: readonly string[] = [...QBO_ENTITY_SEED]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((e) => e.name);
