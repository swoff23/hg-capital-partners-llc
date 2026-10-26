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

/**
 * How many changes are waiting for Save in the move-in form editor, for the
 * bar's "3 unsaved changes" (forms 3.4 A): each item added, deleted or
 * renamed, and each room's Required and Max instances setting that moved.
 * Items are matched by key, so renaming one is a single change. A room that
 * isn't in the saved form counts once.
 */
export function moveInChangeCount(saved: MoveInFormSchema, draft: MoveInFormSchema): number {
  let n = 0;
  const before = new Map(saved.sections.map((s) => [s.key, s]));
  for (const s of draft.sections) {
    const old = before.get(s.key);
    if (!old) {
      n++;
      continue;
    }
    if (s.minCount !== old.minCount) n++;
    if (s.maxCount !== old.maxCount) n++;
    const oldItems = new Map(old.items.map((i) => [i.key, i]));
    const nowKeys = new Set(s.items.map((i) => i.key));
    for (const i of s.items) {
      const was = oldItems.get(i.key);
      if (!was || was.label.trim() !== i.label.trim()) n++;
    }
    for (const i of old.items) if (!nowKeys.has(i.key)) n++;
  }
  return n;
}

/**
 * What stops a save of the move-in form, keyed by place ("sections.0.items.2.label"),
 * in the words the server uses: an item with no name. Shown only once Save has
 * been pressed (forms 2.0). Max instances is clamped to 1 to 10 as it's typed, so it's never refused.
 */
export function moveInProblems(draft: MoveInFormSchema): Record<string, string> {
  const out: Record<string, string> = {};
  draft.sections.forEach((s, si) => {
    s.items.forEach((it, ii) => {
      if (!it.label.trim()) out[`sections.${si}.items.${ii}.label`] = "Name this item.";
    });
  });
  return out;
}
