import Link from "next/link";
import { Money } from "@/components/money";
import { Section } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { monthYear, type LeaseStatus } from "@/lib/tenants/status";

export type EarlierLease = {
  id: string;
  names: string[];
  status: LeaseStatus;
  movesIn: Ymd | null;
  movesOut: Ymd | null;
  rent: number | null;
};

/** "Mar 2023 to Feb 2025", "Moves in Mar 2027", or "Since Mar 2023" when they're still there. */
function stay(l: EarlierLease): string {
  if (l.status === "upcoming") return `Moves in ${monthYear(l.movesIn)}`;
  if (l.movesOut) return l.movesIn ? `${monthYear(l.movesIn)} to ${monthYear(l.movesOut)}` : `Until ${monthYear(l.movesOut)}`;
  return l.movesIn ? `Since ${monthYear(l.movesIn)}` : "Current";
}

/** The unit's other leases, one line each, as the property page lists past tenants. */
export function EarlierAtUnit({ leases }: { leases: EarlierLease[] }) {
  if (leases.length === 0) return null;
  return (
    <Section title="Earlier at this unit">
      <ul className="-mt-1">
        {leases.map((l) => (
          <li key={l.id} className="border-b border-border last:border-0">
            <Link
              href={`/tenants/${l.id}`}
              className="-mx-2 flex min-h-10 items-center gap-1.5 rounded-md px-2 py-1.5 text-body text-foreground transition-colors pointer-fine:hover:bg-muted pointer-coarse:min-h-12"
            >
              <span className="min-w-0 truncate">
                {l.names.join(", ")}
                <span className="text-muted-foreground"> · {stay(l)}</span>
              </span>
              {l.rent !== null && (
                <span className="shrink-0 text-muted-foreground max-sm:hidden">
                  · <Money value={l.rent} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
