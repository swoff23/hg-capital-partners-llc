import type { RepeatRule } from "./repeat";

/**
 * The Repeats editor's state and the stored rule, both ways (D27): Never,
 * every N days, every N weeks, monthly on day D, quarterly, yearly. Pure;
 * see repeat-choice.test.ts.
 */

export type RepeatMode = "never" | "days" | "weeks" | "monthly" | "quarterly" | "yearly";

export interface RepeatChoice {
  mode: RepeatMode;
  /** N for days and weeks. Kept from a stored rule for the other modes. */
  every: number;
  /** Day of the month, for monthly. */
  day: number;
}

export const REPEAT_MODES: readonly { mode: RepeatMode; label: string }[] = [
  { mode: "never", label: "Never" },
  { mode: "days", label: "Every N days" },
  { mode: "weeks", label: "Every N weeks" },
  { mode: "monthly", label: "Monthly" },
  { mode: "quarterly", label: "Quarterly" },
  { mode: "yearly", label: "Yearly" },
];

const clamp = (n: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : fallback;

/** The editor's starting state. `defaultDay` seeds "monthly on day D" (the due date's day, or today's). */
export function choiceFromRule(rule: RepeatRule | null, defaultDay: number): RepeatChoice {
  const day = clamp(defaultDay, 1, 31, 1);
  if (!rule) return { mode: "never", every: 1, day };
  return { mode: rule.freq, every: rule.interval, day: rule.dayOfMonth ?? day };
}

/** The rule to store, or null for Never. Out-of-range numbers are pulled into range. */
export function ruleFromChoice(c: RepeatChoice): RepeatRule | null {
  const every = clamp(c.every, 1, 365, 1);
  switch (c.mode) {
    case "never":
      return null;
    case "days":
    case "weeks":
      return { freq: c.mode, interval: every };
    case "monthly":
      return { freq: "monthly", interval: every, dayOfMonth: clamp(c.day, 1, 31, 1) };
    case "quarterly":
    case "yearly":
      return { freq: c.mode, interval: every };
  }
}
