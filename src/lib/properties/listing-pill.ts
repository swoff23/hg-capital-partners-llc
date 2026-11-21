import type { ListingStatus } from "@prisma/client";
import { daysUntil, fmtDay, toYmd, type Ymd } from "@/lib/dates";

/**
 * The pill on a Rentals card's photo (docs/specs/coming-soon.md 3.2), or
 * undefined for none. Pure; see listing-pill.test.ts. `today` is Buffalo's
 * (todayYmdEastern), so the server and every visitor agree on the day.
 *
 *  - Leased: "Leased".
 *  - Available: "Available Dec 1" while the date is ahead, otherwise no pill.
 *  - Coming soon: "Coming in January" through the last day of the date's
 *    month, then "Coming soon" again; nothing switches the listing to
 *    Available on its own. A month 12 or more ahead names its year ("Coming
 *    in November 2027"), so it never reads as this month or a month this
 *    year. With no date: "Coming soon".
 *  - Hidden: never on Rentals, so no pill.
 */
export function listingPill(status: ListingStatus, availableDate: Date | string | null | undefined, today: Ymd): string | undefined {
  switch (status) {
    case "LEASED":
      return "Leased";
    case "AVAILABLE":
      return (daysUntil(availableDate, today) ?? 0) > 0 ? `Available ${fmtDay(availableDate, { year: "auto", now: today })}` : undefined;
    case "COMING_SOON":
      return comingPill(toYmd(availableDate), today);
    case "HIDDEN":
      return undefined;
  }
}

/** A month 12 or more ahead of today's names its year. */
const YEAR_FROM_MONTHS_AHEAD = 12;

function comingPill(date: Ymd | null, today: Ymd): string {
  if (!date) return "Coming soon";
  const ahead = monthIndex(date) - monthIndex(today);
  if (ahead < 0) return "Coming soon";
  const [y, m] = date.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
  return ahead >= YEAR_FROM_MONTHS_AHEAD ? `Coming in ${month} ${y}` : `Coming in ${month}`;
}

/** Months since year 0 for a "YYYY-MM-DD" day, so two days' months can be subtracted. */
function monthIndex(day: Ymd): number {
  const [y, m] = day.split("-").map(Number);
  return y * 12 + (m - 1);
}
