"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseMoveInFormSchema, type MoveInFormSchema } from "@/lib/move-in-form-types";
import type { ActionResult } from "@/lib/action-result";
import { saveAppConfigColumn } from "@/lib/app-config-write";
import { withResult } from "@/lib/server-action";

const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

const item = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string({ error: "Name this item." }).trim().min(1, "Name this item.").max(80, "Keep the name under 80 characters."),
});

const section = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  items: z.array(item).min(1, "Keep at least one item.").max(30, "That is more than 30 items."),
  repeatable: z.boolean(),
  minCount: z.coerce.number().int().min(0).max(1),
  maxCount: z.coerce.number({ error: "Enter a whole number." }).int("Enter a whole number.").min(1, "Enter 1 to 10.").max(10, "Enter 1 to 10."),
  hasLocation: z.boolean(),
});

const schema = z.object({ sections: z.array(section).min(1).max(20) });

/**
 * Replace the whole move-in form schema (AppConfig, same singleton row as
 * CapEx rules). The editor is a draft saved as one whole with Save (forms 3.4
 * A). Only this column is written, and it's saved against this column's own
 * version (`blobVersion`), so the two tabs' saves never conflict each other
 * (forms 2.12); one saved since the editor loaded is a `ConflictError` naming
 * who and when. Section identity (key/label/repeatable/hasLocation) is fixed
 * in the UI to the five confirmed room types; only item labels and each
 * repeatable section's max-count/required toggle are actually editable here —
 * still validated in full server-side in case that ever changes.
 */
export interface SavedMoveInFormSchema {
  schema: MoveInFormSchema;
  version: string;
}

export async function saveMoveInFormSchema(
  input: unknown,
  expectedVersion: string | null,
): Promise<ActionResult<SavedMoveInFormSchema>> {
  return withResult("saveMoveInFormSchema", async () => {
    const user = await requireUser();
    const parsed = schema.parse(input);

    for (const s of parsed.sections) {
      if (RESERVED.has(s.key)) throw new Error("That room key is reserved.");
      for (const it of s.items) if (RESERVED.has(it.key)) throw new Error("That item key is reserved.");
    }

    const value: MoveInFormSchema = {
      sections: parsed.sections.map((s) => ({
        ...s,
        maxCount: Math.max(s.minCount, s.maxCount),
      })),
    };

    const version = await saveAppConfigColumn(
      "moveInFormSchema",
      expectedVersion,
      value as unknown as object,
      user.name ?? user.email,
    );

    revalidatePath("/settings/move-in-form");
    revalidatePath("/residents/moving-in");

    // Round-trip through the same tolerant parser the read path uses, so the
    // client gets back exactly what a future page load would see.
    return { schema: parseMoveInFormSchema(value), version };
  });
}
