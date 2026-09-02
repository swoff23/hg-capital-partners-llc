"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getMoveInFormSchema } from "@/lib/move-in-form";
import { withResult } from "@/lib/server-action";

// This is the app's first unauthenticated write path — deliberately no
// requireUser() below. Anyone with the URL can submit a report; that's the
// point (a signed-out tenant fills this in). Zod bounds + a honeypot are the
// only abuse protection — no file uploads, no auth, low real-world volume, so
// rate limiting isn't built here. See the move-in form plan for the tradeoff.

const RATING = z.enum(["Good", "Fair", "Poor", "N/A"]);
const itemAnswer = z.object({
  itemKey: z.string().max(40),
  rating: RATING,
  comment: z.string().max(500).optional(),
});
const instanceAnswer = z.object({
  location: z.string().max(80).optional(),
  answers: z.array(itemAnswer).max(30),
});
const sectionAnswer = z.object({
  sectionKey: z.string().max(40),
  instances: z.array(instanceAnswer).max(10),
});

const submissionSchema = z.object({
  tenantName: z.string().trim().min(1).max(120),
  inspectionDate: z.string().max(20),
  propertyId: z.string().min(1).max(40),
  sections: z.array(sectionAnswer).max(20),
  additionalComments: z.string().max(2000).optional(),
  submitterName: z.string().trim().min(1).max(120),
  submitterEmail: z.string().trim().email().max(200),
  honeypot: z.string().max(200).optional(),
});

export async function submitMoveInInspection(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Expected failures are returned by the body; anything thrown (DB down) is
  // logged and turned into the generic line rather than crashing the form.
  const r = await withResult("submitMoveInInspection", () => submitMoveInInspectionBody(input));
  return r.ok ? r.data : { ok: false, error: "Something went wrong. Please try again in a moment." };
}

async function submitMoveInInspectionBody(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form and try again." };
  const p = parsed.data;

  // Honeypot: pretend success, create nothing, don't tip off a bot.
  if (p.honeypot) return { ok: true };

  const property = await prisma.property.findUnique({
    where: { id: p.propertyId },
    select: { id: true, address: true },
  });
  if (!property) return { ok: false, error: "Please select a valid property." };

  const schema = await getMoveInFormSchema();
  const sectionByKey = new Map(schema.sections.map((s) => [s.key, s]));

  const lines: string[] = [];
  lines.push(`Tenant: ${p.tenantName}`);
  lines.push(`Inspection date: ${p.inspectionDate}`);
  lines.push(`Property: ${property.address}`);
  lines.push("");

  for (const sec of p.sections) {
    const def = sectionByKey.get(sec.sectionKey);
    if (!def) continue;
    const itemByKey = new Map(def.items.map((i) => [i.key, i.label]));
    sec.instances.forEach((inst, idx) => {
      if (inst.answers.length === 0 && !inst.location) return; // skip a fully-empty instance
      const heading = def.repeatable
        ? `${def.label}${inst.location ? ` — ${inst.location}` : ` #${idx + 1}`}`
        : def.label;
      lines.push(heading);
      for (const a of inst.answers) {
        const label = itemByKey.get(a.itemKey) ?? a.itemKey;
        lines.push(`  ${label}: ${a.rating}${a.comment ? ` — ${a.comment}` : ""}`);
      }
      lines.push("");
    });
  }

  if (p.additionalComments?.trim()) {
    lines.push("Additional comments:", p.additionalComments.trim(), "");
  }
  lines.push(`Submitted by: ${p.submitterName} <${p.submitterEmail}>`);

  await prisma.task.create({
    data: {
      title: `Move-in inspection — ${property.address} — ${p.tenantName}`,
      description: lines.join("\n"),
      propertyId: property.id,
      bucket: "Property",
      status: "OPEN",
    },
  });

  return { ok: true };
}
