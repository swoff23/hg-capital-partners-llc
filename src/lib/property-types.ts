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

/* ---------------- Equipment lifecycle ----------------
   Age-based planning indicators, NOT automatic replacement instructions.
   `monitor` = first year of the "Monitor" band; `replace` = first year of the "Replace" band.
   Keys match EQUIPMENT_TYPES values in @/lib/config. */
export const EQUIPMENT_LIFECYCLE: Record<string, { monitor: number; replace: number }> = {
  Roof: { monitor: 15, replace: 20 },
  Furnace: { monitor: 12, replace: 17 },
  Boiler: { monitor: 15, replace: 25 },
  HVAC: { monitor: 10, replace: 15 },
  "Water Heater": { monitor: 7, replace: 10 },
  Refrigerator: { monitor: 9, replace: 13 },
  Dishwasher: { monitor: 7, replace: 10 },
  Oven: { monitor: 10, replace: 15 },
  "Washing Machine": { monitor: 7, replace: 10 },
  "Drying Machine": { monitor: 9, replace: 13 },
};

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

/** Lifecycle indicator for an asset, or null when no lifecycle band is defined for its type. */
export function equipmentStatus(
  type: string,
  raw: string | null | undefined,
  now: Date = new Date(),
): EquipmentStatus | null {
  const band = EQUIPMENT_LIFECYCLE[type];
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

/* ---------------- CapEx planning ----------------
   Ballpark replacement cost per asset type, used to project future capital needs.
   Keys match EQUIPMENT_TYPES values in @/lib/config. */
export const EQUIPMENT_REPLACEMENT_COST: Record<string, number> = {
  Roof: 20000,
  Furnace: 6000,
  Boiler: 10000,
  HVAC: 8000,
  "Water Heater": 1500,
  Refrigerator: 1000,
  Dishwasher: 700,
  Oven: 900,
  "Washing Machine": 800,
  "Drying Machine": 800,
};

export function equipmentReplacementCost(type: string): number | null {
  return EQUIPMENT_REPLACEMENT_COST[type] ?? null;
}

/* ---------------- Major building CapEx ----------------
   Building-level systems tracked per property. Age is measured from install / last
   replacement / last substantial renovation. `defaultCost` can be overridden per property. */
export const BUILDING_CAPEX_ITEMS = [
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
] as const;

export type BuildingCapexKey = (typeof BUILDING_CAPEX_ITEMS)[number]["key"];

/** Per-property stored data: { roof: { year: "2010", type: "Shingle", costOverride: 27000 }, ... } */
export type BuildingCapexEntry = {
  year?: string | null;
  /** Free text — material / kind, e.g. "Shingle", "Copper/PEX", "Circuit breakers". */
  type?: string | null;
  costOverride?: number | null;
};
export type BuildingCapexData = Partial<Record<BuildingCapexKey, BuildingCapexEntry>>;

export function parseBuildingCapex(json: unknown): BuildingCapexData {
  return json != null && typeof json === "object" && !Array.isArray(json)
    ? (json as BuildingCapexData)
    : {};
}

export type BuildingCapexRow = {
  key: BuildingCapexKey;
  label: string;
  type: string | null;
  year: string | null;
  age: number | null;
  status: EquipmentStatus;
  /** installYear + replace threshold, or null when the year is unknown. */
  replacementYear: number | null;
  /** costOverride ?? defaultCost. */
  cost: number;
  defaultCost: number;
  costOverridden: boolean;
};

/** Computed view of every building CapEx item for a property. */
export function buildingCapexRows(
  data: BuildingCapexData,
  now: Date = new Date(),
): BuildingCapexRow[] {
  return BUILDING_CAPEX_ITEMS.map((item) => {
    const entry = data[item.key] ?? {};
    const installY = parseInstallYear(entry.year);
    const age = installY == null ? null : Math.max(0, now.getFullYear() - installY);
    const override = entry.costOverride ?? null;
    return {
      key: item.key,
      label: item.label,
      type: entry.type?.trim() || null,
      year: entry.year?.trim() || null,
      age,
      status: lifecycleStatus(age, item.monitor, item.replace),
      replacementYear: installY == null ? null : installY + item.replace,
      cost: override ?? item.defaultCost,
      defaultCost: item.defaultCost,
      costOverridden: override != null && override !== item.defaultCost,
    };
  });
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
  opts: { years?: number; now?: Date; building?: BuildingCapexData } = {},
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

  for (const [ui, u] of units.entries()) {
    for (const e of u.equipment ?? []) {
      const band = EQUIPMENT_LIFECYCLE[e.type];
      const cost = equipmentReplacementCost(e.type);
      if (!band || cost == null) continue;

      const installY = parseInstallYear(e.installYear);
      if (installY == null) {
        unknownCount += 1;
        continue;
      }
      schedule("unit", u.label || `Unit ${ui + 1}`, e.type, installY, band.replace, cost);
    }
  }

  if (opts.building) {
    for (const item of BUILDING_CAPEX_ITEMS) {
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
  opts: { years?: number; now?: Date } = {},
): PortfolioCapexForecast {
  const horizonYears = opts.years ?? 5;
  const now = opts.now ?? new Date();
  const fromYear = now.getFullYear();
  const years = Array.from({ length: horizonYears }, (_, i) => fromYear + i);

  const perYear = new Array(horizonYears).fill(0);
  let dueNowTotal = 0;

  const rows: PortfolioCapexRow[] = properties.map((p) => {
    const f = capexForecast(p.units, { years: horizonYears, now, building: p.building });
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
