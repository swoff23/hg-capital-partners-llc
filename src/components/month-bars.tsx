"use client";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { Money } from "@/components/money";
import { SegmentedControl } from "@/components/segmented-control";
import { niceTop, tickLabel } from "@/lib/chart-scale";
import { fmtMonthYear, monthInitial, monthShort, monthToDateLabel, periodLabel } from "@/lib/quickbooks/period";
import type { MonthPoint } from "@/lib/quickbooks/series";
import { cn, fmtMoney } from "@/lib/utils";

/* The month chart (docs/specs/charts.md 2.1, choices D1 A and D2 A): one
   series at a time in --chart-1, all 12 months at every width, and a
   readout above the plot that names the picked month's figures. HTML and
   CSS like the other bars, so labels use the type tokens and their touch
   sizes. References: Apple Health and Stripe iOS (the readout swaps, nothing
   under the finger), Vercel and Mercury iOS (one series, a metric switch),
   Mercury web (the picked period as a band with a 1px edge, "Sep MTD"),
   Strava and Revolut (12 initials at 375), Copilot (the running month out of
   the default), Cash App and Square (empty and loading frames). */

type Metric = "noi" | "income" | "expense";

const METRIC_NAME: Record<Metric, string> = { noi: "NOI", income: "Income", expense: "Expense" };
/** Under 340px the control and line 3 say In and Out. */
const METRIC_SHORT: Record<Metric, string> = { noi: "NOI", income: "In", expense: "Out" };
const ORDER: Metric[] = ["noi", "income", "expense"];

const valueOf = (m: MonthPoint, metric: Metric) =>
  metric === "noi" ? m.noiCents : metric === "income" ? m.incomeCents : m.expenseCents;

/** Whole dollars with a true minus, for the slots' spoken names. */
const spoken = (cents: number) => {
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${cents < 0 && dollars > 0 ? "−" : ""}${fmtMoney(dollars)}`;
};

type SlotKind = "before-history" | "before-purchase" | "empty" | "running" | "month";

const PLOT_HEIGHT = {
  // 160px on the Overview, 128 below sm; 120 on the record, 96 below sm (ruling 2).
  overview: "h-40 max-sm:h-32",
  record: "h-30 max-sm:h-24",
};

export interface MonthBarsProps {
  /** The 12 months ending with the running month, oldest first, empty ones included. */
  months: MonthPoint[];
  runningMonth: string;
  /** The last synced day, for the running month's readout ("Oct 1 to 25"). */
  through: string | null;
  /** The first month QuickBooks history covers. */
  historyStart: string;
  /** On the property page: the month it was bought, so earlier slots say so. */
  purchaseMonth?: string | null;
  /** Whether any sync has run; before one, the empty frame says lines come after it. */
  synced: boolean;
  /** The Overview's 160px plot, or the record's 120. */
  size: "overview" | "record";
  /** "card" draws its own Overview card; "plain" sits in a section under an h3. */
  frame: "card" | "plain";
}

/**
 * One series at a time (NOI, Income or Expense) for the 12 months ending
 * with the running month. A picked month shows as a --fill-1 band with a
 * 1px --line-control edge and its label in --fg-1; nothing ever dims. The
 * running month is a hollow column over "MTD". With a mouse the band and
 * readout follow the pointer and a click picks; on touch a tap picks and a
 * horizontal drag scrubs (vertical swipes still scroll the page). The 12
 * slots are a radio group with one tab stop: Left and Right move, Home and
 * End jump, and Esc goes back to the default month (when that's already
 * picked, Esc does nothing, so an outer layer still gets it). Each slot is
 * named with a full sentence; the visible labels are hidden from screen
 * readers. A print-only table carries every figure on paper.
 */
export function MonthBars({ months, runningMonth, through, historyStart, purchaseMonth, synced, size, frame }: MonthBarsProps) {
  const [metric, setMetric] = useState<Metric>("noi");

  const kinds: SlotKind[] = useMemo(
    () =>
      months.map((m) =>
        m.periodMonth < historyStart
          ? "before-history"
          : purchaseMonth && m.periodMonth < purchaseMonth
            ? "before-purchase"
            : m.periodMonth === runningMonth
              ? "running"
              : m.lineCount === 0
                ? "empty"
                : "month",
      ),
    [months, historyStart, purchaseMonth, runningMonth],
  );

  // The latest complete month inside history (and owned), even with no lines, so a
  // gap still shows; the running month only when history began this month.
  const defaultIndex = useMemo(() => {
    for (let i = months.length - 1; i >= 0; i--) {
      if (kinds[i] === "month" || kinds[i] === "empty") return i;
    }
    return months.length - 1;
  }, [months, kinds]);

  const [pick, setPick] = useState(defaultIndex);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? pick;
  const hasLines = months.some((m, i) => kinds[i] !== "before-history" && kinds[i] !== "before-purchase" && m.lineCount > 0);

  const span = periodLabel(months[0]?.periodMonth, months[months.length - 1]?.periodMonth) ?? "";
  const name = METRIC_NAME[metric];

  const control = (
    <SegmentedControl
      aria-label="Metric"
      value={metric}
      onChange={setMetric}
      options={ORDER.map((k) => ({
        key: k,
        label:
          k === "noi" ? (
            "NOI"
          ) : (
            <>
              <span className="@max-[340px]:hidden">{METRIC_NAME[k]}</span>
              <span className="@min-[340px]:hidden">{METRIC_SHORT[k]}</span>
            </>
          ),
      }))}
    />
  );

  const body = (
    <>
      {hasLines ? (
        <Readout
          month={months[shown]}
          kind={kinds[shown]}
          metric={metric}
          through={through}
          historyStart={historyStart}
          purchaseMonth={purchaseMonth ?? null}
        />
      ) : null}
      <Plot
        months={months}
        kinds={kinds}
        metric={metric}
        pick={pick}
        shown={shown}
        size={size}
        through={through}
        purchaseMonth={purchaseMonth ?? null}
        defaultIndex={defaultIndex}
        hasLines={hasLines}
        groupLabel={`${name} by month, ${span}`}
        empty={synced ? `No QuickBooks lines for ${span}.` : "Lines show up after the first sync."}
        onPick={(i) => {
          setPick(i);
          setHover(null);
        }}
        onHover={setHover}
      />
      <PrintTable months={months} kinds={kinds} />
    </>
  );

  if (frame === "card") {
    return (
      <Card data-chart="" className="@container">
        <CardHeader className="flex min-h-13 items-center justify-between gap-3 py-2.5">
          <h2 className="min-w-0 truncate text-section text-fg-1">By month</h2>
          {control}
        </CardHeader>
        <CardBody>{body}</CardBody>
      </Card>
    );
  }
  return (
    <div data-chart="" className="@container">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-meta font-medium text-fg-2">By month</h3>
        {control}
      </div>
      {body}
    </div>
  );
}

/**
 * The picked (or previewed) month in three fixed lines, so the block never
 * changes height while scrubbing: the metric and month, the figure, then the
 * other two metrics. Hidden from screen readers, which hear the slot's name.
 */
function Readout({
  month,
  kind,
  metric,
  through,
  historyStart,
  purchaseMonth,
}: {
  month: MonthPoint;
  kind: SlotKind;
  metric: Metric;
  through: string | null;
  historyStart: string;
  purchaseMonth: string | null;
}) {
  const when = kind === "running" ? monthToDateLabel(month.periodMonth, through) : fmtMonthYear(month.periodMonth);
  const noFigure =
    kind === "before-history"
      ? `QuickBooks history starts ${fmtMonthYear(historyStart)}`
      : kind === "before-purchase" && purchaseMonth
        ? `Bought ${fmtMonthYear(purchaseMonth)}`
        : month.lineCount === 0
          ? `No QuickBooks lines for ${monthShort(month.periodMonth)}`
          : null;
  const others = ORDER.filter((k) => k !== metric);
  const value = valueOf(month, metric);
  return (
    <div aria-hidden="true" className="mb-3">
      <p className="truncate text-meta text-fg-3">
        {METRIC_NAME[metric]} · {when}
      </p>
      <p className="flex h-7 items-center">
        {noFigure ? (
          <span className="truncate text-body text-fg-3">{noFigure}</span>
        ) : (
          <Money key={`${metric}-${month.periodMonth}-${value}`} value={value / 100} className="animate-fade-in text-figure-m text-fg-1" />
        )}
      </p>
      <p className="h-4.5 truncate text-meta text-fg-3 pointer-coarse:h-5">
        {!noFigure &&
          others.map((k, i) => (
            <span key={k}>
              {i > 0 && " · "}
              <span className="@max-[340px]:hidden">{METRIC_NAME[k]}</span>
              <span className="@min-[340px]:hidden">{METRIC_SHORT[k]}</span>{" "}
              <Money key={valueOf(month, k)} value={valueOf(month, k) / 100} className="animate-fade-in" />
            </span>
          ))}
      </p>
    </div>
  );
}

function Plot({
  months,
  kinds,
  metric,
  pick,
  shown,
  size,
  through,
  purchaseMonth,
  defaultIndex,
  hasLines,
  groupLabel,
  empty,
  onPick,
  onHover,
}: {
  months: MonthPoint[];
  kinds: SlotKind[];
  metric: Metric;
  pick: number;
  shown: number;
  size: "overview" | "record";
  through: string | null;
  purchaseMonth: string | null;
  defaultIndex: number;
  hasLines: boolean;
  groupLabel: string;
  empty: string;
  onPick: (i: number) => void;
  onHover: (i: number | null) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; scrubbing: boolean } | null>(null);
  const drawn = (i: number) => kinds[i] === "month" || kinds[i] === "running";

  // Ticks from the drawn columns: the top at or above the largest month, a bottom one only below zero.
  const values = months.map((m, i) => (drawn(i) ? valueOf(m, metric) / 100 : 0));
  const top = niceTop(Math.max(0, ...values));
  const bottom = niceTop(Math.max(0, ...values.map((v) => -v)));
  const range = top + bottom;
  // Where zero sits in the column area, from its top.
  const zero = range > 0 ? top / range : 1;
  const ticks = hasLines && range > 0;

  const slotAt = (clientX: number) => {
    const r = frame.current?.getBoundingClientRect();
    if (!r || r.width === 0) return pick;
    return Math.min(months.length - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * months.length)));
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    drag.current = { id: e.pointerId, x: e.clientX, scrubbing: false };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") {
      onHover(slotAt(e.clientX));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.scrubbing && Math.abs(e.clientX - d.x) > 8) {
      d.scrubbing = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.scrubbing) onPick(slotAt(e.clientX));
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") {
      if (e.button === 0) onPick(slotAt(e.clientX));
      return;
    }
    const d = drag.current;
    drag.current = null;
    // A tap picks; a drag already picked as it went, and lifting keeps it.
    if (d && d.id === e.pointerId && !d.scrubbing) onPick(slotAt(e.clientX));
  }

  function focusSlot(i: number) {
    onPick(i);
    requestAnimationFrame(() => frame.current?.querySelector<HTMLInputElement>(`input[value="${i}"]`)?.focus());
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      focusSlot(e.key === "Home" ? 0 : months.length - 1);
    } else if (e.key === "Escape" && pick !== defaultIndex) {
      // One Esc, one layer: it only goes back to the default month, and lets an outer layer have it once there.
      e.stopPropagation();
      focusSlot(defaultIndex);
    }
  }

  const height = PLOT_HEIGHT[size];
  const columnArea = cn("absolute inset-x-0 top-4", ticks && bottom > 0 ? "bottom-4" : "bottom-0");

  return (
    <div className="@container">
      <div
        ref={frame}
        className={cn("relative touch-pan-y select-none", height)}
        onPointerDown={hasLines ? onPointerDown : undefined}
        onPointerMove={hasLines ? onPointerMove : undefined}
        onPointerUp={hasLines ? onPointerUp : undefined}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={hasLines ? onKeyDown : undefined}
        onPointerLeave={(e) => e.pointerType === "mouse" && onHover(null)}
      >
        {/* Under everything: the picked (or previewed) month's band, full plot height. */}
        {hasLines && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex">
            {months.map((m, i) => (
              <span key={m.periodMonth} className={cn("min-w-0 flex-1", i === shown && "bg-fill-1 ring-1 ring-inset ring-line-control")} />
            ))}
          </div>
        )}
        {/* The frame over it: ticks in their own 16px bands, the gridlines, the baseline. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {ticks && top > 0 && (
            <span className="absolute left-0 top-0 text-meta leading-4 text-fg-3">{tickLabel(top)}</span>
          )}
          {ticks && bottom > 0 && (
            <span className="absolute bottom-0 left-0 text-meta leading-4 text-fg-3">{tickLabel(-bottom)}</span>
          )}
          <div className={columnArea}>
            {ticks && top > 0 && <span className="absolute inset-x-0 top-0 h-px bg-line" />}
            {ticks && bottom > 0 && <span className="absolute inset-x-0 bottom-0 h-px bg-line" />}
            <span className="absolute inset-x-0 h-px bg-line-strong" style={{ top: `calc(${zero * 100}% - ${zero === 1 ? 1 : 0}px)` }} />
          </div>
        </div>

        {hasLines ? (
          <RadioGroup
            aria-label={groupLabel}
            orientation="horizontal"
            value={String(pick)}
            onChange={(v) => onPick(Number(v))}
            className="absolute inset-0 flex"
          >
            {months.map((m, i) => {
              const v = valueOf(m, metric) / 100;
              const kind = kinds[i];
              return (
                <Radio
                  key={m.periodMonth}
                  value={String(i)}
                  className={cn(
                    // The plot takes the pointer; a slot only shows the pick and keyboard focus.
                    "pointer-events-none relative min-w-0 flex-1 outline-none",
                    "data-focus-visible:z-10 data-focus-visible:ring-2 data-focus-visible:ring-inset data-focus-visible:ring-act",
                  )}
                >
                  <span className="sr-only">{slotName(m, kind, through, purchaseMonth)}</span>
                  {drawn(i) && v !== 0 && (
                    <span aria-hidden="true" className={columnArea}>
                      {kind === "running" ? (
                        <HollowColumn value={v} top={top} bottom={bottom} zero={zero} />
                      ) : (
                        <Column value={v} top={top} bottom={bottom} zero={zero} />
                      )}
                    </span>
                  )}
                </Radio>
              );
            })}
          </RadioGroup>
        ) : (
          <p className="absolute inset-x-0 top-4 bottom-0 flex items-center justify-center px-4 text-center text-body text-balance text-fg-3">
            {empty}
          </p>
        )}
      </div>
      <Axis months={months} shown={hasLines ? shown : -1} />
    </div>
  );
}

/** A filled column, 60% of its slot and at most 24px, sized by scaleY from the baseline so a metric switch springs. */
function Column({ value, top, bottom, zero }: { value: number; top: number; bottom: number; zero: number }) {
  const up = value > 0;
  const scale = up ? (top > 0 ? value / top : 0) : bottom > 0 ? -value / bottom : 0;
  return (
    <span
      className={cn(
        "absolute inset-x-0 mx-auto block w-3/5 max-w-6 bg-chart-1 transition-transform duration-base ease-spring",
        up ? "origin-bottom" : "origin-top",
      )}
      style={
        up
          ? { bottom: `${(1 - zero) * 100}%`, height: `${zero * 100}%`, transform: `scaleY(${scale})` }
          : { top: `${zero * 100}%`, height: `${(1 - zero) * 100}%`, transform: `scaleY(${scale})` }
      }
    />
  );
}

/**
 * The running month: a 1px --chart-1 edge on --surface, never dashed (dashes
 * mean a reference) and never faded (a fade reads as dimming). Its height
 * changes directly, since scaling would thin its edge.
 */
function HollowColumn({ value, top, bottom, zero }: { value: number; top: number; bottom: number; zero: number }) {
  const up = value > 0;
  const share = up ? (top > 0 ? value / top : 0) : bottom > 0 ? -value / bottom : 0;
  const height = `${share * (up ? zero : 1 - zero) * 100}%`;
  return (
    <span
      className="absolute inset-x-0 mx-auto block w-3/5 max-w-6 border border-chart-1 bg-surface transition-[height] duration-base ease-spring"
      style={up ? { bottom: `${(1 - zero) * 100}%`, height } : { top: `${zero * 100}%`, height }}
    />
  );
}

/**
 * The month axis, the chart's period statement: "Sep" from a 384px plot,
 * initials below it; the year under the first slot and each January from
 * 384px; "MTD" under the running month at every width, held to the plot's
 * edge when its slot is narrow. Hidden from screen readers.
 */
function Axis({ months, shown }: { months: MonthPoint[]; shown: number }) {
  const last = months.length - 1;
  return (
    <div aria-hidden="true" className="mt-1 grid text-meta text-fg-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
      {months.map((m, i) => (
        <span key={m.periodMonth} className={cn("text-center", i === shown && "text-fg-1")}>
          <span className="@max-[384px]:hidden">{monthShort(m.periodMonth)}</span>
          <span className="@min-[384px]:hidden">{monthInitial(m.periodMonth)}</span>
        </span>
      ))}
      {months.map((m, i) => {
        const yearHere = i === 0 || m.periodMonth.endsWith("-01");
        return (
          <span
            key={`${m.periodMonth}-2`}
            className={cn("num whitespace-nowrap", i === last ? "text-right @min-[384px]:text-center" : "text-center")}
          >
            {i === last ? "MTD" : yearHere ? <span className="@max-[384px]:hidden">{m.periodMonth.slice(0, 4)}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

/** Each slot's spoken name, a full sentence. */
function slotName(m: MonthPoint, kind: SlotKind, through: string | null, purchaseMonth: string | null): string {
  const month = fmtMonthYear(m.periodMonth);
  const figures = `NOI ${spoken(m.noiCents)}, income ${spoken(m.incomeCents)}, expense ${spoken(m.expenseCents)}`;
  if (kind === "before-history") return `${month}: before QuickBooks history`;
  if (kind === "before-purchase") return `${month}: before it was bought${purchaseMonth ? ` in ${fmtMonthYear(purchaseMonth)}` : ""}`;
  if (kind === "running") {
    const day = through && through.startsWith(m.periodMonth) ? `, through ${monthShort(m.periodMonth)} ${Number(through.slice(8))}` : "";
    return m.lineCount === 0 ? `${month} so far${day}: no QuickBooks lines` : `${month} so far${day}: ${figures}`;
  }
  if (kind === "empty") return `${month}: no QuickBooks lines`;
  return `${month}: ${figures}`;
}

/** Every figure on paper; `hidden` on screen, so a screen reader doesn't hear the values twice. */
function PrintTable({ months, kinds }: { months: MonthPoint[]; kinds: SlotKind[] }) {
  const cell = "border-b border-line py-1 pr-3 text-right tabular-nums";
  const money = (m: MonthPoint, i: number, cents: number): ReactNode =>
    kinds[i] === "before-history" || kinds[i] === "before-purchase" || m.lineCount === 0 ? "—" : <Money value={cents / 100} />;
  return (
    <table className="mt-4 hidden w-full text-meta print:table">
      <thead>
        <tr>
          <th className="border-b border-line-strong py-1 pr-3 text-left font-medium">Month</th>
          <th className="border-b border-line-strong py-1 pr-3 text-right font-medium">Income</th>
          <th className="border-b border-line-strong py-1 pr-3 text-right font-medium">Expense</th>
          <th className="border-b border-line-strong py-1 text-right font-medium">NOI</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m, i) => (
          <tr key={m.periodMonth}>
            <td className="border-b border-line py-1 pr-3">
              {fmtMonthYear(m.periodMonth)}
              {kinds[i] === "running" ? " MTD" : ""}
            </td>
            <td className={cell}>{money(m, i, m.incomeCents)}</td>
            <td className={cell}>{money(m, i, m.expenseCents)}</td>
            <td className={cn(cell, "pr-0")}>{money(m, i, m.noiCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The chart's loading frame (brand section 7, skeletons): the title and
 * labels draw at once, 12 equal --fill-1 columns at 40% of the plot (so no
 * fake trend) and a --fill-1 block for the figure. Static, no shimmer.
 */
export function MonthBarsSkeleton({ size, months }: { size: "overview" | "record"; months: string[] }) {
  return (
    <Card className="@container" aria-busy="true">
      <CardHeader className="flex min-h-13 items-center justify-between gap-3 py-2.5">
        <h2 className="text-section text-fg-1">By month</h2>
      </CardHeader>
      <CardBody>
        <div aria-hidden="true" className="mb-3">
          <p className="text-meta text-fg-3">NOI</p>
          <p className="flex h-7 items-center">
            <span className="block h-5 w-24 bg-fill-1" />
          </p>
          <p className="h-4.5 pointer-coarse:h-5" />
        </div>
        <div aria-hidden="true" className="@container">
          <div className={cn("relative flex border-b border-line-strong", PLOT_HEIGHT[size])}>
            {months.map((m) => (
              <span key={m} className="relative flex-1">
                <span className="absolute inset-x-0 bottom-0 mx-auto block h-2/5 w-3/5 max-w-6 bg-fill-1" />
              </span>
            ))}
          </div>
          <Axis months={months.map((periodMonth) => ({ periodMonth, incomeCents: 0, expenseCents: 0, noiCents: 0, lineCount: 0 }))} shown={-1} />
        </div>
      </CardBody>
    </Card>
  );
}
