import { HG_TIME_ZONE } from "@/lib/dates";

/**
 * Home's header (docs/home-as-today.md): "Good morning, Connor", then one
 * line that answers the page, "3 need you · 5 late". Pure; see summary.test.ts.
 */

export type DayPart = "morning" | "afternoon" | "evening";

/**
 * Morning before noon, afternoon before 6pm, then evening, on Buffalo's
 * clock. The server runs on UTC on Vercel, where its own hour would greet
 * Buffalo with "evening" from 2pm.
 */
export function dayPart(now: Date): DayPart {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: HG_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/** The first word of a person's name, or null when there's no name to use. */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** "Good morning, Connor", or "Good morning" when the account has no name. */
export function greetingLine(name: string | null | undefined, now: Date): string {
  const first = firstName(name);
  return `Good ${dayPart(now)}${first ? `, ${first}` : ""}`;
}

/**
 * "3 need you · 5 late": how many Needs you rows, then how many of the
 * partner's own tasks are overdue. A clause that is zero drops; null when
 * both are.
 */
export function summaryLine(needYou: number, late: number): string | null {
  const parts: string[] = [];
  if (needYou > 0) parts.push(`${needYou} ${needYou === 1 ? "needs" : "need"} you`);
  if (late > 0) parts.push(`${late} late`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
