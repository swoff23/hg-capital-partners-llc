"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { orphanedEquipmentTypes, parseBuildingCapex, parseUnits, type CapexRules } from "@/lib/property-types";
import type { ActionResult } from "@/lib/action-result";
import { getAppConfig } from "@/lib/app-config";
import { saveAppConfigColumn } from "@/lib/app-config-write";
import { withResult } from "@/lib/server-action";

const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

// The words are the editor's (lib/capex-draft.ts says the same ones before a save is sent), so a refusal reads the same either way.
const years = (field: z.ZodNumber) => field.int("Enter a whole number of years.").min(0, "Enter 0 to 200 years.").max(200, "Enter 0 to 200 years.");
const age = () => years(z.number({ error: "Enter a whole number of years." }));
const money = () =>
  z
    .number({ error: "Enter an amount, like 6,000." })
    .min(0, "Enter an amount up to 10,000,000.")
    .max(10_000_000, "Enter an amount up to 10,000,000.");

const ORDER = "Replace comes after Monitor.";

const equipmentRule = z
  .object({
    type: z.string({ error: "Choose a type." }).trim().min(1, "Choose a type.").max(60, "Keep the type under 60 characters."),
    monitor: age(),
    replace: age(),
    cost: money(),
  })
  .refine((r) => r.replace >= r.monitor, { path: ["replace"], message: ORDER });

const buildingRule = z
  .object({
    // present for existing rows; null / absent for a row added in the editor
    key: z.string().trim().min(1).max(40).nullish(),
    label: z.string({ error: "Name this system." }).trim().min(1, "Name this system.").max(80, "Keep the name under 80 characters."),
    monitor: age(),
    replace: age(),
    defaultCost: money(),
  })
  .refine((r) => r.replace >= r.monitor, { path: ["replace"], message: ORDER });

const schema = z.object({
  equipment: z.array(equipmentRule).max(60, "That is more than 60 rules."),
  building: z.array(buildingRule).max(60, "That is more than 60 systems."),
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

/** A refusal that belongs to one cell, so the editor puts it there ("equipment.2.type"). */
const cell = (path: (string | number)[], message: string) => new z.ZodError([{ code: "custom", path, message, input: undefined }]);

/**
 * Replace the whole CapEx rule set (AppConfig, single row): the editor is a
 * draft now, saved as one whole with Save (forms 3.4 A). Existing building
 * rows keep their key; a new row gets a collision-safe slug generated against
 * every key already in the payload, the defaults, and every key currently in use
 * across `Property.buildingCapex` — so a generated slug can never silently adopt
 * an unrelated property's dormant data.
 *
 * `expectedVersion` is the version of the CapEx blob the editor loaded
 * (`blobVersion`), compared with the stored blob alone, so saving the move-in
 * form never conflicts it; a CapEx blob someone else saved since is a
 * `ConflictError` naming who and when. Returns the persisted rules, because a
 * just-added building system is sent with `key: null` and needs its
 * server-generated key echoed back, and the new version for the next Save.
 */
export interface SavedCapexRules {
  rules: CapexRules;
  version: string;
}

export async function saveCapexRules(
  input: unknown,
  expectedVersion: string | null,
): Promise<ActionResult<SavedCapexRules>> {
  return withResult("saveCapexRules", async () => {
    const user = await requireUser();
    const parsed = schema.parse(input);

    if (parsed.equipment.length === 0) throw cell(["equipment"], "Keep at least one equipment rule.");
    if (parsed.building.length === 0) throw cell(["building"], "Keep at least one building system.");

    // equipment: de-dupe by type (last wins)
    const equipment = [...new Map(parsed.equipment.map((e) => [e.type, e])).values()].map((e) => ({
      type: e.type,
      monitor: e.monitor,
      replace: e.replace,
      cost: Math.round(e.cost),
    }));

    const props = await prisma.property.findMany({ select: { address: true, buildingCapex: true, units: true } });
    const inUse = props.flatMap((p) => Object.keys(parseBuildingCapex(p.buildingCapex)));
    const taken = new Set<string>([
      ...inUse,
      ...(parsed.building.map((b) => b.key?.trim()).filter(Boolean) as string[]),
    ]);
    for (const k of taken) if (RESERVED.has(k)) throw new Error("That name can't be used. Pick another.");

    const seenLabel = new Set<string>();
    const building = parsed.building.map((b, i) => {
      const lk = b.label.toLowerCase();
      if (seenLabel.has(lk)) throw cell(["building", i, "label"], `${b.label} is already listed.`);
      seenLabel.add(lk);

      let key = b.key?.trim() || "";
      if (!key) {
        const base = slug(b.label);
        key = base;
        let n = 2;
        while (taken.has(key) || RESERVED.has(key)) key = `${base}-${n++}`;
        taken.add(key);
      }
      if (RESERVED.has(key)) throw new Error("That name can't be used. Pick another.");

      return {
        key,
        label: b.label,
        monitor: b.monitor,
        replace: b.replace,
        defaultCost: Math.round(b.defaultCost),
      };
    });

    const capexRules: CapexRules = { equipment, building };

    // Equipment matches a rule by its type string: dropping (or renaming —
    // the editor sends that as drop + add) a type that units still carry
    // would silently strip those appliances out of the forecast.
    const current = await getAppConfig();
    const orphans = orphanedEquipmentTypes(
      current.capexRules,
      capexRules,
      props.map((p) => ({ address: p.address, units: parseUnits(p.units) })),
    );
    if (orphans.length > 0) {
      // One line the editor shows above the buttons, under the 200 characters a message may run to.
      const list = orphans.map((o) => `${o.type} (${o.count})`).join(", ");
      throw new Error(`Units still use ${list}. Change their equipment first, or keep the rule.`);
    }

    const version = await saveAppConfigColumn(
      "capexRules",
      expectedVersion,
      capexRules as unknown as object,
      user.name ?? user.email,
    );

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/properties/[id]", "page");
    return { rules: capexRules, version };
  });
}
