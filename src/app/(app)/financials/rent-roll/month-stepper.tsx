"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, chromeIconClass, grandTotalRow, TextLink } from "@/components/ui";
import { Money } from "@/components/money";
import { fmtMonthYear } from "@/lib/quickbooks/period";
import { cn } from "@/lib/utils";

/**
 * "‹ Sep 2026 ›" (charts 2.7): one month at a time on a phone. Two 44px
 * ghost icon buttons around the month; Previous stops at the first month
 * shown, Next at the running month. Left and Right step while it has focus.
 * References: Mercury iOS and web ("‹ October 2025 ›"), Splitwise.
 */
export function MonthStepper({
  months,
  index,
  onChange,
}: {
  months: string[];
  index: number;
  onChange: (index: number) => void;
}) {
  const atStart = index <= 0;
  const atEnd = index >= months.length - 1;
  const prev = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  // Stepping onto an end disables the button that was pressed. Focus goes to the other one, so the
  // keys and the next press keep working instead of dropping to the page.
  const handoff = useRef<"prev" | "next" | null>(null);
  useEffect(() => {
    const to = handoff.current;
    handoff.current = null;
    (to === "next" ? next : to === "prev" ? prev : null)?.current?.focus();
  }, [index]);
  function go(to: number) {
    handoff.current = to <= 0 ? "next" : to >= months.length - 1 ? "prev" : null;
    onChange(to);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" && !atStart) {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "ArrowRight" && !atEnd) {
      e.preventDefault();
      go(index + 1);
    }
  }
  return (
    <div role="group" aria-label="Month" onKeyDown={onKeyDown} className="flex items-center justify-between gap-2">
      <Button ref={prev} variant="ghost" icon aria-label="Previous month" disabled={atStart} onClick={() => go(index - 1)} className="size-11">
        <ChevronLeft aria-hidden="true" className={chromeIconClass} />
      </Button>
      <span aria-live="polite" className="num text-label text-fg-1">
        {fmtMonthYear(months[index])}
      </span>
      <Button ref={next} variant="ghost" icon aria-label="Next month" disabled={atEnd} onClick={() => go(index + 1)} className="size-11">
        <ChevronRight aria-hidden="true" className={chromeIconClass} />
      </Button>
    </div>
  );
}

export interface PhoneRentRow {
  propertyId: string;
  address: string;
  purchaseMonth: string | null;
  byMonth: Record<string, number>;
}

/**
 * The rent roll below sm: a month at a time under the stepper. The month's
 * rent as the headline, then each property's (blank before it was bought,
 * the dash after with none), the rent on no property's class, and the
 * Portfolio row under the grand-total rule. Starts on the last complete
 * month. Amounts are cents.
 */
export function RentRollByMonth({
  months,
  startIndex,
  basis,
  rows,
  unassigned,
  portfolioByMonth,
}: {
  /** The months the stepper walks, oldest first, ending with the running month. */
  months: string[];
  startIndex: number;
  basis: "CASH" | "ACCRUAL";
  rows: PhoneRentRow[];
  unassigned: Record<string, number> | null;
  portfolioByMonth: Record<string, number>;
}) {
  const [index, setIndex] = useState(startIndex);
  const month = months[index];
  const total = portfolioByMonth[month];
  const dash = <span className="text-fg-3">—</span>;
  return (
    <div className="space-y-3">
      <MonthStepper months={months} index={index} onChange={setIndex} />
      {/* Rent billed on accrual, received on cash (integration decision 10). */}
      {total != null ? (
        <p className="text-figure-m text-fg-1">
          <Money value={total / 100} /> <span className="text-body text-fg-3">{basis === "CASH" ? "received" : "billed"}</span>
        </p>
      ) : (
        <p className="flex h-7 items-center text-body text-fg-3">No rent {basis === "CASH" ? "received" : "billed"}</p>
      )}
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const cents = r.byMonth[month];
          const notYet = r.purchaseMonth != null && month < r.purchaseMonth;
          return (
            <li key={r.propertyId} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <TextLink href={`/properties/${r.propertyId}`} className="min-w-0 truncate">
                {r.address}
              </TextLink>
              <span className="shrink-0 text-right text-body">
                {cents ? (
                  <Money value={cents / 100} />
                ) : notYet ? (
                  <span className="text-meta text-fg-3">Bought {fmtMonthYear(r.purchaseMonth!)}</span>
                ) : (
                  dash
                )}
              </span>
            </li>
          );
        })}
        {unassigned && (
          <li className="flex min-h-12 items-center justify-between gap-3 py-2">
            <span className="min-w-0 text-fg-2">Rent not tied to a property</span>
            <span className="shrink-0 text-right text-body text-fg-2">
              {unassigned[month] ? <Money value={unassigned[month] / 100} /> : dash}
            </span>
          </li>
        )}
      </ul>
      <div className={cn("flex min-h-12 items-center justify-between gap-3", grandTotalRow)}>
        <span>Portfolio</span>
        <span className="text-right">{total != null ? <Money value={total / 100} /> : <span className="font-normal text-fg-3">—</span>}</span>
      </div>
    </div>
  );
}
