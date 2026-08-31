export type RatingItem = { key: string; label: string };

export type MoveInSection = {
  key: string;
  label: string;
  items: RatingItem[];
  repeatable: boolean; // Bathroom / Bedroom — tenant can add more than one instance
  minCount: number; // 0 = optional, 1 = at least one instance required
  maxCount: number; // 1 for non-repeatable sections
  hasLocation: boolean; // prompt for a location label per instance (e.g. "Bathroom 1", "Upstairs")
};

export type MoveInFormSchema = { sections: MoveInSection[] };

const item = (label: string): RatingItem => ({ key: slug(label), label });

export const DEFAULT_MOVE_IN_FORM_SCHEMA: MoveInFormSchema = {
  sections: [
    {
      key: "kitchen",
      label: "Kitchen",
      repeatable: false,
      minCount: 1,
      maxCount: 1,
      hasLocation: false,
      items: [
        "Cabinets", "Floor", "Ceiling", "Walls", "Countertops", "Stove", "Oven",
        "Refrigerator", "Windows", "Doors", "Lights", "Outlets", "Sink", "Dishwasher", "Drawers",
      ].map(item),
    },
    {
      key: "living-room",
      label: "Living Room",
      repeatable: false,
      minCount: 1,
      maxCount: 1,
      hasLocation: false,
      items: ["Floor", "Ceiling", "Walls", "Windows", "Doors", "Lights", "Outlets"].map(item),
    },
    {
      key: "bathroom",
      label: "Bathroom",
      repeatable: true,
      minCount: 1,
      maxCount: 3,
      hasLocation: true,
      items: [
        "Floor", "Ceiling", "Walls", "Windows", "Doors", "Lights", "Outlets", "Shower/Tub", "Toilet", "Sink",
      ].map(item),
    },
    {
      key: "bedroom",
      label: "Bedroom",
      repeatable: true,
      minCount: 1,
      maxCount: 5,
      hasLocation: true,
      items: ["Floor", "Ceiling", "Walls", "Windows", "Doors", "Lights", "Outlets", "Closet"].map(item),
    },
    {
      key: "other-areas",
      label: "Other Areas",
      repeatable: false,
      minCount: 0,
      maxCount: 1,
      hasLocation: false,
      items: ["Front Door", "Air Conditioner", "Furnace/Heater", "Smoke Alarm", "Patio/Deck", "Yard"].map(item),
    },
  ],
};

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Tolerant parse of the stored `AppConfig.moveInFormSchema` blob. Never throws.
 * Same shape as parseCapexRules: stored JSON is authoritative (never merged over
 * defaults — a removed item stays removed); a section with no valid items is
 * dropped entirely; sections/items are de-duped by key (last wins); a blob that
 * parses to zero sections falls back to the full defaults.
 */
export function parseMoveInFormSchema(json: unknown): MoveInFormSchema {
  if (!json || typeof json !== "object" || Array.isArray(json)) return DEFAULT_MOVE_IN_FORM_SCHEMA;
  const j = json as { sections?: unknown };
  if (!Array.isArray(j.sections)) return DEFAULT_MOVE_IN_FORM_SCHEMA;

  const parseItem = (r: unknown): RatingItem[] => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!key || RESERVED_KEYS.has(key) || !label) return [];
    return [{ key, label }];
  };

  const dedupe = <T,>(rows: T[], k: (t: T) => string) =>
    [...new Map(rows.map((t) => [k(t), t] as const)).values()];

  const parseSection = (r: unknown): MoveInSection[] => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!key || RESERVED_KEYS.has(key) || !label) return [];

    const items = Array.isArray(o.items) ? dedupe(o.items.flatMap(parseItem), (i) => i.key) : [];
    if (items.length === 0) return [];

    const minCount = Math.max(0, Math.trunc(Number(o.minCount)) || 0);
    const maxCountRaw = Math.trunc(Number(o.maxCount)) || 1;
    const maxCount = Math.max(1, minCount, maxCountRaw);
    const repeatable = maxCount > 1 || o.repeatable === true;
    const hasLocation = o.hasLocation === true;

    return [{ key, label, items, repeatable, minCount, maxCount, hasLocation }];
  };

  const sections = dedupe(j.sections.flatMap(parseSection), (s) => s.key);
  if (sections.length === 0) return DEFAULT_MOVE_IN_FORM_SCHEMA;
  return { sections };
}
