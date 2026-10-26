"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fmtDay, todayYmdEastern } from "@/lib/dates";
import { renderPlainEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { getMoveInFormSchema } from "@/lib/move-in-form";
import { firstName } from "@/lib/names";
import { shortAddress } from "@/lib/normalize";
import { rentableUnitLabels } from "@/lib/property-types";
import { withResult } from "@/lib/server-action";
import { createTask, systemPrincipal } from "@/lib/tasks/service";
import { headers } from "next/headers";
import { clientIp, RateLimiter } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";

// This is the app's first unauthenticated write path — deliberately no
// requireUser() below. Anyone with the URL can submit a report; that's the
// point (a signed-out tenant fills this in). Abuse protection: zod bounds, a
// honeypot, a per-IP limit (5 / hour) and a global cap (40 / day) — every
// submission becomes a Task on the team's list, so the ceiling is what
// matters. No file uploads, no auth.
const perIp = new RateLimiter(5, 60 * 60_000);
const globalCap = new RateLimiter(40, 24 * 60 * 60_000);
const RATE_LIMITED = "Too many submissions right now. Please try again later, or text us instead.";

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
  unitLabel: z.string().trim().max(80).optional(),
  sections: z.array(sectionAnswer).max(20),
  additionalComments: z.string().max(2000).optional(),
  submitterName: z.string().trim().min(1).max(120),
  submitterEmail: z.string().trim().email().max(200),
  honeypot: z.string().max(200).optional(),
});

/**
 * Submits the report. The answer is an ActionResult, so the form's own
 * `callAction` and the app's saves read it the same way (forms 2.12), and
 * `copied` says whether the emailed copy went, for the sent screen: it never
 * promises a copy that wasn't sent.
 */
export async function submitMoveInInspection(input: unknown): Promise<ActionResult<{ copied: boolean }>> {
  // Expected failures are returned by the body; anything thrown (DB down) is
  // logged and turned into the generic line rather than crashing the form.
  const r = await withResult("submitMoveInInspection", () => submitMoveInInspectionBody(input));
  return r.ok ? r.data : { ok: false, error: "Something went wrong. Please try again in a moment." };
}

async function submitMoveInInspectionBody(input: unknown): Promise<ActionResult<{ copied: boolean }>> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form and try again." };
  const p = parsed.data;

  // Honeypot: pretend success, create nothing, don't tip off a bot.
  if (p.honeypot) return { ok: true, data: { copied: false } };

  const ip = clientIp(await headers());
  if (!perIp.allow(ip).ok || !globalCap.allow("moving-in").ok) return { ok: false, error: RATE_LIMITED };
  perIp.prune();

  const property = await prisma.property.findUnique({
    where: { id: p.propertyId },
    select: { id: true, address: true, units: true },
  });
  if (!property) return { ok: false, error: "Please select a valid property." };

  // The unit, so staff don't have to work it out from the lease: one of the
  // property's rentable units (the same list the form offered), matched the
  // way tasks and lockbox codes match labels. The form requires it where
  // there's a choice; a page loaded before this field existed sends none,
  // and that report still goes through without a unit.
  const units = rentableUnitLabels(property.units);
  const unit =
    units.length === 1
      ? units[0]
      : units.find((u) => u.toLowerCase() === (p.unitLabel ?? "").trim().toLowerCase()) ?? null;
  if (units.length > 1 && p.unitLabel && !unit) return { ok: false, error: "Please select your unit." };

  const schema = await getMoveInFormSchema();
  const sectionByKey = new Map(schema.sections.map((s) => [s.key, s]));

  const lines: string[] = [];
  lines.push(`Tenant: ${p.tenantName}`);
  lines.push(`Inspection date: ${p.inspectionDate}`);
  lines.push(`Property: ${property.address}`);
  if (unit) lines.push(`Unit: ${unit}`);
  lines.push("");

  for (const sec of p.sections) {
    const def = sectionByKey.get(sec.sectionKey);
    if (!def) continue;
    const itemByKey = new Map(def.items.map((i) => [i.key, i.label]));
    sec.instances.forEach((inst, idx) => {
      if (inst.answers.length === 0 && !inst.location) return; // skip a fully-empty instance
      const heading = def.repeatable
        ? `${def.label}${inst.location ? ` (${inst.location})` : ` #${idx + 1}`}`
        : def.label;
      lines.push(heading);
      for (const a of inst.answers) {
        const label = itemByKey.get(a.itemKey) ?? a.itemKey;
        lines.push(`  ${label}: ${a.rating}${a.comment ? ` (${a.comment})` : ""}`);
      }
      lines.push("");
    });
  }

  if (p.additionalComments?.trim()) {
    lines.push("Additional comments:", p.additionalComments.trim(), "");
  }
  lines.push(`Submitted by: ${p.submitterName} <${p.submitterEmail}>`);

  // Due the day it arrives, still unassigned (decision 17, G2C-IV02): it sorts
  // with that day's rows on Today and the property's Tasks card, and reads
  // late the next day instead of sinking among the undated rows.
  await createTask(
    {
      title: `Move-in inspection for ${p.tenantName} at ${property.address}${unit ? `, ${unit}` : ""}`,
      description: lines.join("\n"),
      propertyId: property.id,
      unitLabel: unit,
      dueDate: todayYmdEastern(),
    },
    systemPrincipal("Move-in form"), // public submission; nobody signed in to attribute it to
  );

  const where = `${shortAddress(property.address)}${unit ? `, ${unit}` : ""}`;
  const copied = await emailCopy(p.submitterEmail, p.submitterName, where, lines);
  return { ok: true, data: { copied } };
}

/**
 * The resident's own copy of what they sent (PUBLIC-046), in the one email
 * layout. Only the report's own lines go, nothing from the app. It can fail
 * without failing the report, which is already saved: false means no copy
 * went, and the sent screen says nothing of one.
 */
async function emailCopy(to: string, name: string, where: string, lines: readonly string[]): Promise<boolean> {
  try {
    const { text, html } = renderPlainEmail({
      line: `Thanks, ${firstName(name) || name}. Here's a copy of the move-in report you sent for ${where}.`,
      items: lines.map((l) => l.trim()).filter(Boolean),
      closing: "We'll follow up if anything needs attention.",
      buttonLabel: "Moving in",
      buttonUrl: `${getEnv().appUrl}/residents/moving-in`,
      footnote: `Sent ${fmtDay(todayYmdEastern(), { year: "auto" })} through the HG residents page.`,
    });
    const sent = await sendEmail({ to, subject: `Your move-in report for ${where}`, text, html });
    return sent.ok;
  } catch (err) {
    logError("moving-in:copy", err);
    return false;
  }
}
