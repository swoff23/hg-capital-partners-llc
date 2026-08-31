"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseBuildingCapex, type CapexRules } from "@/lib/property-types";

const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

// z.coerce.number() rejects NaN / non-numeric; .int() additionally rejects Infinity.
const age = z.coerce.number().int().min(0).max(200);
const money = z.coerce.number().min(0).max(10_000_000);

const equipmentRule = z
  .object({
    type: z.string().trim().min(1).max(60),
    monitor: age,
    replace: age,
    cost: money,
  })
  .refine((r) => r.replace >= r.monitor, {
    path: ["replace"],
    message: "Replace age must be ≥ Monitor age",
  });

const buildingRule = z
  .object({
    // present for existing rows; null / absent for a row added in the editor
    key: z.string().trim().min(1).max(40).nullish(),
    label: z.string().trim().min(1).max(80),
    monitor: age,
    replace: age,
    defaultCost: money,
  })
  .refine((r) => r.replace >= r.monitor, {
    path: ["replace"],
    message: "Replace age must be ≥ Monitor age",
  });

const schema = z.object({
  equipment: z.array(equipmentRule).max(60),
  building: z.array(buildingRule).max(60),
});

/** label → a short, stable, url-safe key. Empty result falls back to "system". */
function slug(label: string): string {
  return (
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "system"
  );
}

/**
 * Replace the whole CapEx rule set (AppConfig, single row). Existing building
 * rows keep their key; a new row gets a collision-safe slug generated against
 * every key already in the payload, the defaults, and every key currently in use
 * across `Property.buildingCapex` — so a generated slug can never silently adopt
 * an unrelated property's dormant data.
 *
 * Returns the persisted rules (rather than the repo's usual `void`) because the
 * editor autosaves per field with no separate Save step — a just-added building
 * system is sent with `key: null` and needs its server-generated key echoed back
 * before the next edit to that row, or a fresh slug would be minted every time.
 */
export async function saveCapexRules(input: unknown): Promise<CapexRules> {
  const user = await requireUser();
  const parsed = schema.parse(input);

  if (parsed.equipment.length === 0 || parsed.building.length === 0)
    throw new Error("Keep at least one equipment rule and one building system.");

  // equipment: de-dupe by type (last wins)
  const equipment = [...new Map(parsed.equipment.map((e) => [e.type, e])).values()].map((e) => ({
    type: e.type,
    monitor: e.monitor,
    replace: e.replace,
    cost: Math.round(e.cost),
  }));

  const inUse = (await prisma.property.findMany({ select: { buildingCapex: true } })).flatMap((p) =>
    Object.keys(parseBuildingCapex(p.buildingCapex)),
  );
  const taken = new Set<string>([
    ...inUse,
    ...(parsed.building.map((b) => b.key?.trim()).filter(Boolean) as string[]),
  ]);
  for (const k of taken) if (RESERVED.has(k)) throw new Error(`Reserved building key: ${k}`);

  const seenLabel = new Set<string>();
  const building = parsed.building.map((b) => {
    const lk = b.label.toLowerCase();
    if (seenLabel.has(lk)) throw new Error(`Duplicate building system name: ${b.label}`);
    seenLabel.add(lk);

    let key = b.key?.trim() || "";
    if (!key) {
      const base = slug(b.label);
      key = base;
      let i = 2;
      while (taken.has(key) || RESERVED.has(key)) key = `${base}-${i++}`;
      taken.add(key);
    }
    if (RESERVED.has(key)) throw new Error(`Reserved building key: ${key}`);

    return {
      key,
      label: b.label,
      monitor: b.monitor,
      replace: b.replace,
      defaultCost: Math.round(b.defaultCost),
    };
  });

  const capexRules: CapexRules = { equipment, building };
  await prisma.appConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      capexRules: capexRules as unknown as object,
      updatedBy: user.name ?? user.email,
    },
    update: {
      capexRules: capexRules as unknown as object,
      updatedBy: user.name ?? user.email,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/properties/[id]", "page");
  return capexRules;
}
