"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseMoveInFormSchema, type MoveInFormSchema } from "@/lib/move-in-form-types";

const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

const item = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
});

const section = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  items: z.array(item).min(1).max(30),
  repeatable: z.boolean(),
  minCount: z.coerce.number().int().min(0).max(1),
  maxCount: z.coerce.number().int().min(1).max(10),
  hasLocation: z.boolean(),
});

const schema = z.object({ sections: z.array(section).min(1).max(20) });

/**
 * Replace the whole move-in form schema (AppConfig, same singleton row as
 * CapEx rules — only this column is written, so the two tabs' saves can't
 * clobber each other). Section identity (key/label/repeatable/hasLocation) is
 * fixed in the UI to the five confirmed room types; only item labels and each
 * repeatable section's max-count/required toggle are actually editable here —
 * still validated in full server-side in case that ever changes.
 */
export async function saveMoveInFormSchema(input: unknown): Promise<MoveInFormSchema> {
  const user = await requireUser();
  const parsed = schema.parse(input);

  for (const s of parsed.sections) {
    if (RESERVED.has(s.key)) throw new Error(`Reserved section key: ${s.key}`);
    for (const it of s.items) if (RESERVED.has(it.key)) throw new Error(`Reserved item key: ${it.key}`);
  }

  const value: MoveInFormSchema = {
    sections: parsed.sections.map((s) => ({
      ...s,
      maxCount: Math.max(s.minCount, s.maxCount),
    })),
  };

  await prisma.appConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", moveInFormSchema: value as unknown as object, updatedBy: user.name ?? user.email },
    update: { moveInFormSchema: value as unknown as object, updatedBy: user.name ?? user.email },
  });

  revalidatePath("/settings/move-in-form");
  revalidatePath("/residents/moving-in");

  // Round-trip through the same tolerant parser the read path uses, so the
  // client gets back exactly what a future page load would see.
  return parseMoveInFormSchema(value);
}
