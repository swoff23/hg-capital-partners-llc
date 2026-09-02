export type UnitUtilities = {
  nationalGridAcct?: string | null;
  nationalGridAutopay?: string | null;
  nationalGridLofl?: string | null;
  nationalFuelAcct?: string | null;
  nationalFuelAutopay?: string | null;
  nationalFuelLofl?: string | null;
  waterAcct?: string | null;
  waterAutopay?: string | null;
};

export type UnitEquipment = {
  type: string;
  model?: string | null;
  installYear?: string | null;
  comment?: string | null;
};

export type PropertyUnit = {
  label?: string | null;
  lockboxCode?: string | null;
  utilities?: UnitUtilities;
  equipment?: UnitEquipment[];
};

/** A clean year value ("2016", "~2004") stays in the Year field; anything else is a comment. */
const YEAR_ONLY = /^~?\s*(19|20)\d{2}\s*$/;

/**
 * Split legacy free-text crammed into `installYear` into a real year + a comment.
 * Non-destructive: keeps any 4-digit year it can find, moves the original prose to `comment`.
 */
export function normalizeEquipment(e: UnitEquipment): UnitEquipment {
  const raw = (e.installYear ?? "").trim();
  if (!raw || YEAR_ONLY.test(raw) || /^(newer|older)$/i.test(raw)) return e;
  if (!/\s|[?!,;]|or\b/i.test(raw)) return e; // single token like "circa2004" — leave alone

  const year = raw.match(/(19|20)\d{2}/)?.[0] ?? "";
  const comment = [e.comment?.trim(), raw].filter(Boolean).join(" — ");
  return { ...e, installYear: year, comment };
}

export function parseUnits(json: unknown): PropertyUnit[] {
  if (!Array.isArray(json)) return [];
  return (json as PropertyUnit[]).map((u) => ({
    ...u,
    equipment: u.equipment?.map(normalizeEquipment),
  }));
}

/** Utility fields grouped by provider, for a per-utility layout. */
export const UTILITY_GROUPS: { name: string; fields: [keyof UnitUtilities, string][] }[] = [
  {
    name: "National Grid",
    fields: [
      ["nationalGridAcct", "Acct #"],
      ["nationalGridAutopay", "Autopay"],
      ["nationalGridLofl", "LOFL"],
    ],
  },
  {
    name: "National Fuel",
    fields: [
      ["nationalFuelAcct", "Acct #"],
      ["nationalFuelAutopay", "Autopay"],
      ["nationalFuelLofl", "LOFL"],
    ],
  },
  {
    name: "Buffalo Water",
    fields: [
      ["waterAcct", "Acct #"],
      ["waterAutopay", "Autopay"],
    ],
  },
];

/** These utility fields are a set status, not free text. */
export const UTILITY_STATUS_FIELDS = new Set<keyof UnitUtilities>([
  "nationalGridAutopay",
  "nationalGridLofl",
  "nationalFuelAutopay",
  "nationalFuelLofl",
  "waterAutopay",
]);

export const UTILITY_STATUS_OPTIONS = ["Done", "Need to set up", "Call to confirm", "NA"] as const;

export function utilityStatusTone(v: string | null | undefined): "green" | "red" | "amber" | "gray" {
  switch ((v ?? "").trim().toLowerCase()) {
    case "done":
      return "green";
    case "need to set up":
      return "red";
    case "call to confirm":
      return "amber";
    default:
      return "gray";
  }
}

/* ---------------- CapEx planning rules ----------------
   Age-based planning indicators, NOT automatic replacement instructions.
   `monitor` = first year of the "Monitor" band; `replace` = first year of the
   "Replace" band; the cost is the ballpark full-replacement figure the forecast
   uses. These ship as DEFAULT_CAPEX_RULES and are editable at /settings — the
   effective set is loaded from the AppConfig row via getCapexRules() (server).
   Equipment `type` values match EQUIPMENT_TYPES in @/lib/config. */
export type EquipmentRule = { type: string; monitor: number; replace: number; cost: number };
export type BuildingRule = {
  key: string;
  label: string;
  monitor: number;
  replace: number;
  defaultCost: number;
};
export type CapexRules = { equipment: EquipmentRule[]; building: BuildingRule[] };

export const DEFAULT_CAPEX_RULES: CapexRules = {
  equipment: [
    { type: "Roof", monitor: 15, replace: 20, cost: 20000 },
    { type: "Furnace", monitor: 12, replace: 17, cost: 6000 },
    { type: "Boiler", monitor: 15, replace: 25, cost: 10000 },
    { type: "HVAC", monitor: 10, replace: 15, cost: 8000 },
    { type: "Water Heater", monitor: 7, replace: 10, cost: 1500 },
    { type: "Refrigerator", monitor: 9, replace: 13, cost: 1000 },
    { type: "Dishwasher", monitor: 7, replace: 10, cost: 700 },
    { type: "Oven", monitor: 10, replace: 15, cost: 900 },
    { type: "Washing Machine", monitor: 7, replace: 10, cost: 800 },
    { type: "Drying Machine", monitor: 9, replace: 13, cost: 800 },
  ],
  building: [
    { key: "roof", label: "Roof", monitor: 15, replace: 20, defaultCost: 25000 },
    { key: "windows", label: "Windows", monitor: 20, replace: 30, defaultCost: 20000 },
    { key: "electrical", label: "Electrical Service / Main Panels", monitor: 25, replace: 40, defaultCost: 15000 },
    { key: "plumbing", label: "Main Plumbing / Supply Lines", monitor: 30, replace: 50, defaultCost: 20000 },
    { key: "sewer", label: "Main Sewer Line", monitor: 40, replace: 60, defaultCost: 15000 },
    { key: "porches", label: "Porches / Exterior Decks", monitor: 15, replace: 25, defaultCost: 20000 },
    { key: "driveway", label: "Driveway / Parking", monitor: 10, replace: 20, defaultCost: 12000 },
    { key: "siding", label: "Exterior Siding", monitor: 20, replace: 30, defaultCost: 25000 },
    { key: "garage", label: "Garage", monitor: 20, replace: 30, defaultCost: 20000 },
    { key: "masonry", label: "Masonry / Repointing", monitor: 15, replace: 25, defaultCost: 20000 },
  ],
};

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Tolerant parse of the stored `AppConfig.capexRules` blob. Never throws.
 * Stored JSON is authoritative and complete (never merged over defaults, so a
 * removed rule stays removed); numbers are coerced finite-or-drop-the-row; rows
 * are de-duped by type / key (last wins) and reserved keys are dropped. A section
 * that is missing / not an array falls back to that section's default; a blob
 * that parses to two empty sections falls back to the full defaults.
 */
export function parseCapexRules(json: unknown): CapexRules {
  if (!json || typeof json !== "object" || Array.isArray(json)) return DEFAULT_CAPEX_RULES;
  const j = json as { equipment?: unknown; building?: unknown };

  const fin = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const age = (v: unknown) => {
    const n = fin(v);
    return n == null ? null : Math.max(0, Math.trunc(n));
  };
  const money = (v: unknown) => {
    const n = fin(v);
    return n == null ? null : Math.max(0, Math.round(n));
  };

  const eqRow = (r: unknown): EquipmentRule[] => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type.trim() : "";
    const m = age(o.monitor);
    const rp = age(o.replace);
    const c = money(o.cost);
    if (!type || RESERVED_KEYS.has(type) || m == null || rp == null || c == null) return [];
    return [{ type, monitor: m, replace: Math.max(m, rp), cost: c }];
  };
  const bRow = (r: unknown): BuildingRule[] => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const m = age(o.monitor);
    const rp = age(o.replace);
    const c = money(o.defaultCost);
    if (!key || RESERVED_KEYS.has(key) || !label || m == null || rp == null || c == null) return [];
    return [{ key, label, monitor: m, replace: Math.max(m, rp), defaultCost: c }];
  };

  const dedupe = <T,>(rows: T[], k: (t: T) => string) =>
    [...new Map(rows.map((t) => [k(t), t] as const)).values()];

  const eqRaw = Array.isArray(j.equipment) ? j.equipment.flatMap(eqRow) : null;
  const bRaw = Array.isArray(j.building) ? j.building.flatMap(bRow) : null;

  const equipment = eqRaw ? dedupe(eqRaw, (e) => e.type) : DEFAULT_CAPEX_RULES.equipment;
  const building = bRaw ? dedupe(bRaw, (b) => b.key) : DEFAULT_CAPEX_RULES.building;

  if (equipment.length === 0 && building.length === 0) return DEFAULT_CAPEX_RULES;
  return { equipment, building };
}

export interface OrphanedEquipmentType {
  type: string;
  /** Equipment entries across all units that carry this type. */
  count: number;
  /** Addresses of the properties affected. */
  properties: string[];
}

/**
 * Equipment types that `next` drops relative to `prev` while some unit still
 * has equipment of that type. Equipment matches a rule by the `type` string,
 * so removing (or renaming, which the editor sends as remove + add) a rule
 * silently strips the lifecycle status and forecast from every matching
 * appliance. saveCapexRules refuses such a change and reports these.
 */
export function orphanedEquipmentTypes(
  prev: CapexRules,
  next: CapexRules,
  properties: { address: string; units: PropertyUnit[] }[],
): OrphanedEquipmentType[] {
  const nextTypes = new Set(next.equipment.map((e) => e.type));
  const dropped = prev.equipment.map((e) => e.type).filter((t) => !nextTypes.has(t));
  if (dropped.length === 0) return [];
  const out: OrphanedEquipmentType[] = [];
  for (const type of dropped) {
    let count = 0;
    const addrs: string[] = [];
    for (const p of properties) {
      const n = p.units.reduce((s, u) => s + (u.equipment ?? []).filter((e) => e.type === type).length, 0);
      if (n > 0) {
        count += n;
        addrs.push(p.address);
      }
    }
    if (count > 0) out.push({ type, count, properties: addrs });
  }
  return out;
}

export type EquipmentStatus = "Good" | "Monitor" | "Replace" | "Unknown";

/** Shared Good/Monitor/Replace/Unknown banding by age. */
export function lifecycleStatus(
  age: number | null,
  monitor: number,
  replace: number,
): EquipmentStatus {
  if (age == null) return "Unknown";
  if (age >= replace) return "Replace";
  if (age >= monitor) return "Monitor";
  return "Good";
}

/** Pull a 4-digit year out of the free-text install/replacement field ("2016", "~2012", "Newer"). */
export function parseInstallYear(raw: string | null | undefined): number | null {
  const m = (raw ?? "").match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

/** Whole years since install/last replacement, or null if the year is unknown. */
export function equipmentAge(raw: string | null | undefined, now: Date = new Date()): number | null {
  const y = parseInstallYear(raw);
  if (y == null) return null;
  return Math.max(0, now.getFullYear() - y);
}

/** Lifecycle indicator for an asset, or null when no rule is defined for its type. */
export function equipmentStatus(
  type: string,
  raw: string | null | undefined,
  rules: CapexRules,
  now: Date = new Date(),
): EquipmentStatus | null {
  const band = rules.equipment.find((e) => e.type === type);
  if (!band) return null;
  return lifecycleStatus(equipmentAge(raw, now), band.monitor, band.replace);
}

export function equipmentStatusTone(s: EquipmentStatus | null): "green" | "amber" | "red" | "gray" {
  switch (s) {
    case "Good":
      return "green";
    case "Monitor":
      return "amber";
    case "Replace":
      return "red";
    default:
      return "gray";
  }
}

/** Ballpark replacement cost for an asset type, or null when no rule covers it. */
export function equipmentReplacementCost(type: string, rules: CapexRules): number | null {
  return rules.equipment.find((e) => e.type === type)?.cost ?? null;
}

/* ---------------- Major building CapEx ----------------
   Per-property stored data, keyed by a BuildingRule.key. */
export type BuildingCapexEntry = {
  year?: string | null;
  /** Free text — material / kind, e.g. "Shingle", "Copper/PEX", "Circuit breakers". */
  type?: string | null;
  costOverride?: number | null;
};
/** { roof: { year: "2010", type: "Shingle", costOverride: 27000 }, ... } */
export type BuildingCapexData = Partial<Record<string, BuildingCapexEntry>>;

export function parseBuildingCapex(json: unknown): BuildingCapexData {
  return json != null && typeof json === "object" && !Array.isArray(json)
    ? (json as BuildingCapexData)
    : {};
}

export type CapexForecastItem = {
  /** Unit label, or "Building" for property-level systems. */
  unitLabel: string;
  scope: "unit" | "building";
  type: string;
  age: number | null;
  /** Calendar year the asset is projected to reach end of typical useful life. */
  dueYear: number;
  /** Years from now until dueYear (0 = due this year, including already-overdue assets). */
  yearsOut: number;
  /** Already past its replace threshold. */
  overdue: boolean;
  cost: number;
};

export type CapexForecastYear = {
  year: number;
  total: number;
  count: number;
  items: CapexForecastItem[];
};

export type CapexForecast = {
  horizonYears: number;
  fromYear: number;
  years: CapexForecastYear[];
  /** Sum of every item across the horizon. */
  total: number;
  /** Subset due this year (overdue + hitting end of life in the current year). */
  dueNowTotal: number;
  dueNowCount: number;
  /** Priced, lifecycle-tracked assets whose install year is unknown (can't be scheduled). */
  unknownCount: number;
};

/**
 * Project replacement cost across a property over the next `years` calendar years — every priced,
 * lifecycle-tracked unit appliance plus every dated major building system. An item is scheduled in
 * `installYear + replaceThreshold`; anything already overdue lands in the current year.
 */
export function capexForecast(
  units: PropertyUnit[],
  opts: { years?: number; now?: Date; building?: BuildingCapexData; rules: CapexRules },
): CapexForecast {
  const horizonYears = opts.years ?? 5;
  const now = opts.now ?? new Date();
  const fromYear = now.getFullYear();
  const lastYear = fromYear + horizonYears - 1;

  const buckets = new Map<number, CapexForecastItem[]>();
  for (let y = fromYear; y <= lastYear; y++) buckets.set(y, []);

  let total = 0;
  let dueNowTotal = 0;
  let dueNowCount = 0;
  let unknownCount = 0;

  const schedule = (
    scope: "unit" | "building",
    unitLabel: string,
    type: string,
    installY: number,
    replace: number,
    cost: number,
  ) => {
    const projected = installY + replace;
    if (!Number.isFinite(projected)) return; // guard vs a malformed rule reaching buckets.get(NaN)
    if (projected > lastYear) return; // still healthy past the horizon
    const dueYear = Math.max(fromYear, projected);
    buckets.get(dueYear)!.push({
      unitLabel,
      scope,
      type,
      age: Math.max(0, fromYear - installY),
      dueYear,
      yearsOut: dueYear - fromYear,
      overdue: projected <= fromYear,
      cost,
    });
    total += cost;
    if (dueYear === fromYear) {
      dueNowTotal += cost;
      dueNowCount += 1;
    }
  };

  const byType = new Map(opts.rules.equipment.map((r) => [r.type, r] as const));

  for (const [ui, u] of units.entries()) {
    for (const e of u.equipment ?? []) {
      const rule = byType.get(e.type);
      if (!rule) continue;

      const installY = parseInstallYear(e.installYear);
      if (installY == null) {
        unknownCount += 1;
        continue;
      }
      schedule("unit", u.label || `Unit ${ui + 1}`, e.type, installY, rule.replace, rule.cost);
    }
  }

  if (opts.building) {
    for (const item of opts.rules.building) {
      const entry = opts.building[item.key];
      const installY = parseInstallYear(entry?.year);
      if (installY == null) {
        if (entry?.year != null && entry.year.trim() !== "") unknownCount += 1;
        continue;
      }
      schedule("building", "Building", item.label, installY, item.replace, entry?.costOverride ?? item.defaultCost);
    }
  }

  const years: CapexForecastYear[] = [];
  for (let y = fromYear; y <= lastYear; y++) {
    const items = buckets.get(y)!.sort((a, b) => b.cost - a.cost);
    years.push({
      year: y,
      items,
      count: items.length,
      total: items.reduce((s, it) => s + it.cost, 0),
    });
  }

  return { horizonYears, fromYear, years, total, dueNowTotal, dueNowCount, unknownCount };
}

/* ---------------- Portfolio rollup ---------------- */
export type PortfolioCapexProperty = {
  id: string;
  address: string;
  units: PropertyUnit[];
  building: BuildingCapexData;
};

export type PortfolioCapexRow = {
  id: string;
  address: string;
  /** Spend per forecast year, index-aligned with `PortfolioCapexForecast.years`. */
  perYear: number[];
  total: number;
  dueNow: number;
  /** Every scheduled replacement for this property across the horizon (year asc, then cost desc). */
  items: CapexForecastItem[];
};

export type PortfolioCapexForecast = {
  fromYear: number;
  horizonYears: number;
  years: number[];
  /** Portfolio-wide spend per forecast year. */
  perYear: number[];
  total: number;
  dueNowTotal: number;
  /** Per-property breakdown, highest 5-year total first. */
  rows: PortfolioCapexRow[];
};

/** Aggregate every property's CapEx forecast into a property × year matrix. */
export function portfolioCapexForecast(
  properties: PortfolioCapexProperty[],
  opts: { years?: number; now?: Date; rules: CapexRules },
): PortfolioCapexForecast {
  const horizonYears = opts.years ?? 5;
  const now = opts.now ?? new Date();
  const fromYear = now.getFullYear();
  const years = Array.from({ length: horizonYears }, (_, i) => fromYear + i);

  const perYear = new Array(horizonYears).fill(0);
  let dueNowTotal = 0;

  const rows: PortfolioCapexRow[] = properties.map((p) => {
    const f = capexForecast(p.units, { years: horizonYears, now, building: p.building, rules: opts.rules });
    const py = f.years.map((y) => y.total);
    py.forEach((v, i) => (perYear[i] += v));
    dueNowTotal += f.dueNowTotal;
    return {
      id: p.id,
      address: p.address,
      perYear: py,
      total: f.total,
      dueNow: f.dueNowTotal,
      items: f.years.flatMap((y) => y.items),
    };
  });

  rows.sort((a, b) => b.total - a.total);
  const total = perYear.reduce((s, v) => s + v, 0);
  return { fromYear, horizonYears, years, perYear, total, dueNowTotal, rows };
}
