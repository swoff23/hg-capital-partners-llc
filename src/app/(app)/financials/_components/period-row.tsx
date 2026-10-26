"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { QboBasis } from "@prisma/client";
import { ChevronDown } from "lucide-react";
import { SegmentedControl } from "@/components/segmented-control";
import { Sheet } from "@/components/sheet";
import { pickerChipClass } from "@/components/ui";
import { PERIOD_LABEL, type PeriodKey } from "@/lib/quickbooks/period";
import { cn } from "@/lib/utils";
import { RefreshButton } from "./refresh-button";

const PERIODS = [
  { key: "last", label: PERIOD_LABEL.last },
  { key: "ytd", label: PERIOD_LABEL.ytd },
] as const;

const BASES = [
  { key: "CASH", label: "Cash" },
  { key: "ACCRUAL", label: "Accrual" },
] as const;

/**
 * Moves the page to a new period or basis in the URL (`?period=last`,
 * `?basis=cash`), the way Refresh does: in a transition, so the figures on
 * screen stay until the new ones land. Year to date is the default, so it
 * leaves `period` out; the basis is always explicit, since without it the
 * one chosen in Settings applies.
 */
function useFigureParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  return (next: { period?: PeriodKey; basis?: QboBasis }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.period === "ytd") sp.delete("period");
    else if (next.period) sp.set("period", next.period);
    if (next.basis) sp.set("basis", next.basis === "CASH" ? "cash" : "accrual");
    const query = sp.toString();
    start(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
}

/** Cash | Accrual, as a one-off switch from the basis Settings picks (selectors 3.8; charts 2.6). */
export function BasisControl({ basis, size = "sm", fullWidth }: { basis: QboBasis; size?: "sm" | "md"; fullWidth?: boolean }) {
  const go = useFigureParams();
  return (
    <SegmentedControl
      aria-label="Basis"
      size={size}
      fullWidth={fullWidth}
      options={BASES}
      value={basis}
      onChange={(b) => b !== basis && go({ basis: b })}
    />
  );
}

function PeriodControl({ period, size = "sm", fullWidth }: { period: PeriodKey; size?: "sm" | "md"; fullWidth?: boolean }) {
  const go = useFigureParams();
  return (
    <SegmentedControl
      aria-label="Period"
      size={size}
      fullWidth={fullWidth}
      options={PERIODS}
      value={period}
      onChange={(p) => p !== period && go({ period: p })}
    />
  );
}

/**
 * The Overview's period row (FINANCIALS-001, charts 2.6), above everything it
 * scopes: "Last month | Year to date", then "Cash | Accrual", then Refresh
 * at the right. It never wraps: below sm the two switches need about 380px
 * on touch, so they fold into one chip ("Year to date · Cash") that opens a
 * "Period and basis" sheet with the same two switches. A tap there applies
 * at once; Esc or the close button shuts it. "12 months" joins in January
 * 2027, once it would differ from Year to date.
 */
export function PeriodRow({ period, basis }: { period: PeriodKey; basis: QboBasis }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3 max-sm:hidden">
        <PeriodControl period={period} />
        <BasisControl basis={basis} />
      </div>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(pickerChipClass({ size: "sm" }), "min-w-0 sm:hidden")}
      >
        <span className="truncate">
          {PERIOD_LABEL[period]} · {basis === "CASH" ? "Cash" : "Accrual"}
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-3" />
      </button>
      <div className="shrink-0">
        <RefreshButton />
      </div>
      <Sheet title="Period and basis" isOpen={open} onOpenChange={setOpen}>
        <div className="space-y-4 p-4 md:w-96">
          <div className="space-y-2">
            <p className="text-meta text-fg-3">Period</p>
            <PeriodControl period={period} size="md" fullWidth />
          </div>
          <div className="space-y-2">
            <p className="text-meta text-fg-3">Basis</p>
            <BasisControl basis={basis} size="md" fullWidth />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
