import { stableJson } from "@/lib/drafts";
import type { MoveInFormSchema, MoveInSection } from "@/lib/move-in-form-types";

/**
 * The public move-in report as steps (forms 2.14, 3.5 A): About you, one step
 * per room, then Review. Pure, so steps.test.ts runs it without a page: which
 * steps there are, what each says, what Next checks (only the step you're on),
 * and what the report is sent as. The page is move-in-form.tsx.
 */

export const RATINGS = ["Good", "Fair", "Poor", "N/A"] as const;
export type Rating = (typeof RATINGS)[number];

export type ItemAnswer = { rating: Rating | ""; comment: string };
/** One room as the resident fills it in: Bathroom 1, Bathroom 2. */
export type Instance = { location: string; items: Record<string, ItemAnswer> };

/** Everything the resident has entered. It is the draft: plain JSON, kept on the device. */
export type Answers = {
  name: string;
  email: string;
  propertyId: string;
  unitLabel: string;
  /** The inspection date, "YYYY-MM-DD". */
  date: string;
  /** Section key to its instances. */
  rooms: Record<string, Instance[]>;
  comments: string;
};

export type Step = { kind: "about" } | { kind: "room"; key: string; label: string } | { kind: "review" };

/** The property the resident picked, as the page offers it: its labels only, never a lockbox code. */
export type PropertyChoice = { id: string; units: string[] };

export function blankInstance(section: MoveInSection): Instance {
  return {
    location: "",
    items: Object.fromEntries(section.items.map((i) => [i.key, { rating: "" as const, comment: "" }])),
  };
}

/** The first thing the resident sees: a required room starts with its first instance, as before. */
export function blankAnswers(schema: MoveInFormSchema, today: string): Answers {
  return {
    name: "",
    email: "",
    propertyId: "",
    unitLabel: "",
    date: today,
    rooms: Object.fromEntries(schema.sections.map((s) => [s.key, Array.from({ length: Math.max(1, s.minCount) }, () => blankInstance(s))])),
    comments: "",
  };
}

/** About you, a step per room in the order the editor sets, Review. */
export function buildSteps(schema: MoveInFormSchema): Step[] {
  return [
    { kind: "about" },
    ...schema.sections.map((s): Step => ({ kind: "room", key: s.key, label: s.label })),
    { kind: "review" },
  ];
}

export function stepName(step: Step): string {
  return step.kind === "about" ? "About you" : step.kind === "review" ? "Review" : step.label;
}

/** The line over the progress bar: "Kitchen · 3 of 7". */
export function stepLine(steps: readonly Step[], at: number): string {
  return `${stepName(steps[at])} · ${at + 1} of ${steps.length}`;
}

/**
 * What the primary says. The first step names the room that comes next, so
 * the resident knows ("Start with the kitchen"); the last sends; the rest are
 * Next.
 */
export function nextLabel(steps: readonly Step[], at: number): string {
  if (at >= steps.length - 1) return "Send move-in report";
  if (at === 0 && steps[1]?.kind === "room") return `Start with the ${steps[1].label.toLowerCase()}`;
  return "Next";
}

export type Problems = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The About you step: every field is asked, in words that say what to enter. A unit is asked where there's a choice. */
export function aboutProblems(a: Answers, property: PropertyChoice | undefined): Problems {
  const out: Problems = {};
  if (!a.name.trim()) out.name = "Enter your name.";
  if (!a.email.trim()) out.email = "Enter your email.";
  else if (!EMAIL.test(a.email.trim())) out.email = "Enter an email, like name@example.com.";
  if (!a.propertyId) out.propertyId = "Choose your property.";
  else if (property && property.units.length > 1 && !a.unitLabel) out.unitLabel = "Choose your unit.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) out.date = "Enter the date of the inspection.";
  return out;
}

/** The key of one item's line in `roomProblems`: "kitchen.0.sink". */
export const itemKey = (sectionKey: string, instance: number, item: string) => `${sectionKey}.${instance}.${item}`;

/**
 * A room step. Where the editor's Required is on (`minCount` of 1 or more,
 * COPY-IV04, PUBLIC-041), every item of every instance needs a rating; N/A
 * covers what doesn't apply. An optional room asks for nothing.
 */
export function roomProblems(section: MoveInSection, instances: readonly Instance[]): Problems {
  const out: Problems = {};
  if (section.minCount < 1) return out;
  instances.forEach((inst, i) => {
    for (const item of section.items) {
      if (!inst.items[item.key]?.rating) out[itemKey(section.key, i, item.key)] = "Choose a rating.";
    }
  });
  return out;
}

/** What Next checks: only the step you're on. */
export function stepProblems(
  step: Step,
  answers: Answers,
  schema: MoveInFormSchema,
  property: PropertyChoice | undefined,
): Problems {
  if (step.kind === "about") return aboutProblems(answers, property);
  if (step.kind === "review") return {};
  const section = schema.sections.find((s) => s.key === step.key);
  return section ? roomProblems(section, answers.rooms[section.key] ?? []) : {};
}

/** The first step with something missing, for "Kitchen is next" and for Send finding what Next let through; -1 when every step is complete. */
export function firstIncomplete(
  steps: readonly Step[],
  answers: Answers,
  schema: MoveInFormSchema,
  property: PropertyChoice | undefined,
): number {
  return steps.findIndex((s) => Object.keys(stepProblems(s, answers, schema, property)).length > 0);
}

/** Whether anything has been entered beyond what the form starts with, so a draft is worth keeping and asking about. */
export function hasProgress(a: Answers, schema: MoveInFormSchema, today: string): boolean {
  return stableJson(a) !== stableJson(blankAnswers(schema, today));
}

/** One item the resident marked Fair or Poor, for the review step's list and its Edit link. */
export type Flagged = {
  sectionKey: string;
  sectionLabel: string;
  /** "Bathroom 2" or "Bathroom (Upstairs)" for a room that can repeat; the room's name otherwise. */
  place: string;
  item: string;
  rating: Rating;
  comment: string;
};

export function flaggedItems(schema: MoveInFormSchema, a: Answers): Flagged[] {
  const out: Flagged[] = [];
  for (const s of schema.sections) {
    (a.rooms[s.key] ?? []).forEach((inst, i) => {
      for (const item of s.items) {
        const ans = inst.items[item.key];
        if (ans?.rating === "Fair" || ans?.rating === "Poor") {
          out.push({
            sectionKey: s.key,
            sectionLabel: s.label,
            place: instanceName(s, i, inst.location),
            item: item.label,
            rating: ans.rating,
            comment: ans.comment.trim(),
          });
        }
      }
    });
  }
  return out;
}

/** A room instance's name: "Bathroom 2", or "Bathroom 2 (Upstairs)" once the resident said where; just the room when it can't repeat. */
export function instanceName(section: Pick<MoveInSection, "label" | "repeatable">, index: number, location: string): string {
  if (!section.repeatable) return section.label;
  const where = location.trim();
  return `${section.label} ${index + 1}${where ? ` (${where})` : ""}`;
}

/**
 * A version of the form's rooms and items, so a draft kept for one form never
 * lands on a form whose rooms changed since: the count and a short hash of the
 * keys in order.
 */
export function formVersion(schema: MoveInFormSchema): string {
  const text = schema.sections.map((s) => `${s.key}:${s.items.map((i) => i.key).join(",")}:${s.minCount}-${s.maxCount}`).join("|");
  let h = 0;
  for (const ch of text) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return `${schema.sections.length}-${(h >>> 0).toString(36)}`;
}

/** What `submitMoveInInspection` takes: the same shape it always has. One name is both the tenant's and the sender's. */
export function toSubmission(a: Answers, schema: MoveInFormSchema, property: PropertyChoice | undefined, honeypot: string) {
  return {
    tenantName: a.name.trim(),
    inspectionDate: a.date,
    propertyId: a.propertyId,
    unitLabel: property && property.units.length === 1 ? property.units[0] : a.unitLabel || undefined,
    sections: schema.sections.map((s) => ({
      sectionKey: s.key,
      instances: (a.rooms[s.key] ?? []).map((inst) => ({
        location: inst.location.trim() || undefined,
        answers: Object.entries(inst.items)
          .filter(([, ans]) => ans.rating)
          .map(([key, ans]) => ({ itemKey: key, rating: ans.rating as Rating, comment: ans.comment.trim() || undefined })),
      })),
    })),
    additionalComments: a.comments.trim() || undefined,
    submitterName: a.name.trim(),
    submitterEmail: a.email.trim(),
    honeypot: honeypot || undefined,
  };
}

/**
 * Brings what a draft or a stale page holds in line with the form as it is:
 * rooms and items that were added since are blank, ones that were removed are
 * dropped, and a required room keeps at least one instance. Pure.
 */
export function reconcile(a: Answers, schema: MoveInFormSchema): Answers {
  const rooms: Answers["rooms"] = {};
  for (const s of schema.sections) {
    const kept = (a.rooms[s.key] ?? []).slice(0, s.maxCount);
    rooms[s.key] = (kept.length > 0 ? kept : [blankInstance(s)]).map((inst) => ({
      location: inst.location,
      items: Object.fromEntries(s.items.map((i) => [i.key, inst.items[i.key] ?? { rating: "" as const, comment: "" }])),
    }));
  }
  return { ...a, rooms };
}
