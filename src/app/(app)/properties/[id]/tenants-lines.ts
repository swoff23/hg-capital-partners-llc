import { fmtDay, type Ymd } from "@/lib/dates";
import { fmtMoney } from "@/lib/utils";
import { monthYear } from "@/lib/tenants/status";

/** Who is on a lease, the primary first, as the section's rows read them. */
export const namesLine = (names: readonly string[]) => names.join(", ");

/** The meta line under a unit with someone living there: "Next: Ana Ruiz from Feb 1". */
export function nextLine(names: readonly string[], movesIn: Ymd | null, today: Ymd): string {
  const who = namesLine(names);
  return movesIn ? `Next: ${who} from ${fmtDay(movesIn, { year: "auto", now: today })}` : `Next: ${who}`;
}

/** A vacant unit's row when a lease is coming: "Ana Ruiz · moves in Feb 1". */
export function vacantNextLine(names: readonly string[], movesIn: Ymd | null, today: Ymd): string {
  const who = namesLine(names);
  return movesIn ? `${who} · moves in ${fmtDay(movesIn, { year: "auto", now: today })}` : who;
}

/** One past lease: "Amy Chen, Bo Chen · Front · Mar 2023 to Feb 2025 · $1,750". Parts it doesn't have are left out. */
type PastLease = { names: readonly string[]; unitLabel: string | null; movesIn: Ymd | null; movesOut: Ymd | null; rent: number | null };

/** A past lease's details after the names: "Front · Mar 2023 to Feb 2025 · $1,750". */
export function pastDetail(p: PastLease): string {
  const dates = p.movesIn && p.movesOut ? `${monthYear(p.movesIn)} to ${monthYear(p.movesOut)}` : p.movesOut ? `Moved out ${monthYear(p.movesOut)}` : null;
  return [p.unitLabel, dates, p.rent == null ? null : fmtMoney(p.rent)].filter(Boolean).join(" · ");
}

export function pastLine(p: PastLease): string {
  return [namesLine(p.names), pastDetail(p)].filter(Boolean).join(" · ");
}
