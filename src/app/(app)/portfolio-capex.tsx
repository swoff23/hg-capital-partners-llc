"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Section, Table, Td, Th, TextLink, textLinkClass } from "@/components/ui";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import { shortAddress } from "@/lib/normalize";
import {
  capexUndatedNote,
  portfolioCapexForecast,
  type CapexForecastItem,
  type CapexRules,
  type PortfolioCapexProperty,
} from "@/lib/property-types";
import { ForecastYearBars, grandTotalCell } from "./properties/capex-ui";

type TipContent = {
  /** Which value opened it, so a second tap on the same value closes it. */
  key: string;
  title: string;
  items: CapexForecastItem[];
  /** Prefix each line with its due year (for values that span more than one year). */
  showYear: boolean;
};

/** `x` is the value's center; the panel clamps itself to the page gutter once it knows its width. */
type Tip = TipContent & { x: number; top: number; flip: boolean };

/** The page gutter the panel keeps from the viewport's edges: 16 on phones, 24 on tablets, 32 on desktops. */
const gutter = (width: number) => (width < 640 ? 16 : width < 1024 ? 24 : 32);

/** Fades a cell's content, not the cell, so the header and total rules run unbroken. */
function Fade({ faded, children }: { faded: boolean; children: ReactNode }) {
  return <span className={cn("transition-opacity duration-fast", faded && "opacity-30")}>{children}</span>;
}

/**
 * The portfolio's 5-year CapEx forecast: the total, spend by year (pick a
 * year to spotlight its column), and a property by year table that totals
 * like a statement. A value's assets show in a small panel: on hover with a
 * mouse, on keyboard focus, and on a tap on touch, since touch has no hover.
 * This year's spend is "Due now"; only what's past its replacement age
 * reads in --danger. Below sm the table keeps Property, one year (this one,
 * or the year picked in the chart) and the 5-year total, so nothing scrolls
 * out of sight. Lives on /properties, under the property table, at #capex.
 */
export function PortfolioCapexForecastCard({
  properties,
  rules,
  id,
  className,
}: {
  properties: PortfolioCapexProperty[];
  rules: CapexRules;
  /** The section's anchor ("capex", so Home can link to /properties#capex). */
  id?: string;
  className?: string;
}) {
  const f = portfolioCapexForecast(properties, { years: 5, rules });
  const undatedNote = capexUndatedNote(f.unknownCount);
  const rows = f.rows.filter((r) => r.total > 0);
  const lastYear = f.years[f.years.length - 1];

  // Click a year in the chart to spotlight that year's column in the table below.
  const [selYear, setSelYear] = useState<number | null>(null);
  const selIdx = selYear == null ? -1 : f.years.indexOf(selYear);
  // The one year column a phone shows: the picked year, or this one.
  const phoneIdx = selIdx >= 0 ? selIdx : 0;
  const pastDue = f.rows.some((r) => r.items.some((it) => it.pastDue));

  const [tip, setTip] = useState<Tip | null>(null);
  // The open panel's id, so its value's button can point at it.
  const tipId = useId();

  function openTip(el: HTMLElement, content: TipContent) {
    const r = el.getBoundingClientRect();
    const flip = r.bottom + 220 > window.innerHeight;
    setTip({ ...content, x: r.left + r.width / 2, top: flip ? r.top - 6 : r.bottom + 6, flip });
  }

  // Centered on its value, then held inside the page gutter by its own measured width.
  // It renders hidden at the left edge, so it can be measured, and shows once placed.
  const tipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!tip || !el) return;
    const vw = document.documentElement.clientWidth;
    const g = gutter(vw);
    const w = el.offsetWidth;
    el.style.left = `${Math.max(g, Math.min(tip.x - w / 2, vw - g - w))}px`;
    el.style.visibility = "visible";
  }, [tip]);

  // The panel is fixed where its value was, so a scroll closes it; so do Esc
  // and a tap anywhere but that value.
  const openKey = tip?.key ?? null;
  useEffect(() => {
    if (openKey == null) return;
    const close = () => setTip(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      const at = e.target instanceof Element ? e.target.closest("[data-tip]")?.getAttribute("data-tip") : null;
      if (at !== openKey) close();
    };
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [openKey]);

  const breakdown = (content: TipContent, children: ReactNode) => (
    <Breakdown
      content={content}
      open={openKey === content.key}
      tipId={tipId}
      onOpen={(el) => openTip(el, content)}
      onClose={() => setTip(null)}
    >
      {children}
    </Breakdown>
  );

  const itemsForYear = (year: number) => f.rows.flatMap((row) => row.items.filter((it) => it.dueYear === year));
  const allItems = f.rows.flatMap((row) => row.items);

  return (
    <div id={id} className={cn("scroll-mt-[calc(var(--app-bar-h)+1.5rem)]", className)}>
      <Section
        title="5-year CapEx forecast"
        actions={
          <span className="num text-meta text-fg-3">
            {f.fromYear} to {lastYear}
          </span>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Money value={selIdx >= 0 ? f.perYear[selIdx] : f.total} className="text-figure-m text-fg-1" />
              {selIdx >= 0 ? (
                <span className="text-meta text-fg-3">
                  <span className="num">{selYear}</span> spend ·{" "}
                  <button type="button" onClick={() => setSelYear(null)} className={textLinkClass}>
                    show all 5 years
                  </button>
                </span>
              ) : (
                f.dueNowTotal > 0 && (
                  <span className={cn("text-meta", pastDue ? "text-danger" : "text-fg-2")}>
                    <Money value={f.dueNowTotal} /> due now
                  </span>
                )
              )}
            </div>
            {undatedNote && <p className="mt-1 text-meta text-fg-3">{undatedNote}</p>}
          </div>

          {/* Spend by year: picking one spotlights its column in the table. */}
          <ForecastYearBars
            years={f.years.map((year, i) => ({ year, total: f.perYear[i] }))}
            selected={selYear}
            onSelect={(year) => setSelYear((cur) => (cur === year ? null : year))}
          />

          {/* Property by year */}
          {rows.length > 0 ? (
            <Table className="sm:min-w-140">
              <thead>
                <tr>
                  <Th className="pl-0">Property</Th>
                  {f.years.map((y, i) => (
                    <Th key={y} numeric className={cn(i !== phoneIdx && "max-sm:hidden")}>
                      <Fade faded={selYear != null && selYear !== y}>{y}</Fade>
                    </Th>
                  ))}
                  <Th numeric className="pr-0">
                    <Fade faded={selYear != null}>5-yr</Fade>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const rowActive = selIdx < 0 || r.perYear[selIdx] > 0;
                  const name = shortAddress(r.address);
                  return (
                    <tr key={r.id} className={cn("transition-opacity duration-fast", !rowActive && "opacity-30")}>
                      <Td className="max-w-56 truncate pl-0">
                        <TextLink href={`/properties/${r.id}`}>{name}</TextLink>
                      </Td>
                      {r.perYear.map((v, i) => {
                        const year = f.years[i];
                        const items = r.items.filter((it) => it.dueYear === year);
                        const faded = selYear != null && selYear !== year;
                        return (
                          <Td
                            key={i}
                            numeric
                            className={cn(
                              i !== phoneIdx && "max-sm:hidden",
                              // This year's spend is due now; red only when some of it is past its replacement age.
                              v === 0 ? "text-fg-3" : items.some((it) => it.pastDue) ? "text-danger" : "text-fg-1",
                            )}
                          >
                            <Fade faded={faded}>
                              {breakdown(
                                { key: `${r.id}-${year}`, title: `${name} · ${year}`, items, showYear: false },
                                v ? <Money value={v} /> : "—",
                              )}
                            </Fade>
                          </Td>
                        );
                      })}
                      <Td numeric className="pr-0">
                        <Fade faded={selYear != null}>
                          {breakdown(
                            { key: `${r.id}-all`, title: `${name} · ${f.fromYear} to ${lastYear}`, items: r.items, showYear: true },
                            <Money value={r.total} />,
                          )}
                        </Fade>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <Td className={cn("pl-0", grandTotalCell)}>Total</Td>
                  {f.perYear.map((v, i) => {
                    const year = f.years[i];
                    const faded = selYear != null && selYear !== year;
                    return (
                      <Td key={i} numeric className={cn(grandTotalCell, i !== phoneIdx && "max-sm:hidden")}>
                        <Fade faded={faded}>
                          {breakdown(
                            { key: `all-${year}`, title: `Portfolio · ${year}`, items: itemsForYear(year), showYear: false },
                            // An empty year is the dash in fg-3, not the total row's fg-1 at 600 (section 3).
                            v ? <Money value={v} /> : <span className="font-normal text-fg-3">—</span>,
                          )}
                        </Fade>
                      </Td>
                    );
                  })}
                  <Td numeric className={cn(grandTotalCell, "pr-0")}>
                    <Fade faded={selYear != null}>
                      {breakdown(
                        { key: "all-all", title: `Portfolio · ${f.fromYear} to ${lastYear}`, items: allItems, showYear: true },
                        <Money value={f.total} />,
                      )}
                    </Fade>
                  </Td>
                </tr>
              </tfoot>
            </Table>
          ) : (
            <p className="text-body text-fg-3">
              No projected CapEx in the next 5 years. Add install years to unit equipment and building systems to
              build the forecast.
            </p>
          )}
        </div>
      </Section>

      {tip && (
        <div
          ref={tipRef}
          id={tipId}
          role="tooltip"
          className={cn(
            // As wide as its lines, up to 336px, and never past the page gutter (32px on a phone's two sides).
            "pointer-events-none fixed z-50 w-max max-w-[min(21rem,calc(100vw-2rem))] rounded-lg border border-line-float bg-raised p-3 text-meta text-fg-1 shadow-float",
            tip.flip && "-translate-y-full",
          )}
          style={{ left: 0, top: tip.top, visibility: "hidden" }}
        >
          <p className="mb-2 font-semibold">{tip.title}</p>
          <div className="space-y-1.5">
            {[...tip.items]
              .sort((a, b) => a.dueYear - b.dueYear || b.cost - a.cost)
              .map((it, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {tip.showYear && (
                      <span className={cn("num mr-1", it.pastDue ? "text-danger" : "text-fg-3")}>
                        {it.dueYear === f.fromYear ? "Due now" : it.dueYear}
                      </span>
                    )}
                    <span className="font-medium">{it.type}</span>
                    <span className="text-fg-3"> · {it.unitLabel}</span>
                  </span>
                  <Money value={it.cost} className="shrink-0" />
                </div>
              ))}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-1.5 font-semibold">
            <span>Total</span>
            <Money value={tip.items.reduce((s, it) => s + it.cost, 0)} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A table value that opens its assets: hover with a mouse, keyboard focus,
 * or a tap, which toggles it. Plain text when there are none. While it's
 * open the button names the panel (`tipId`), which renders after the
 * section, so a screen reader reads the assets as its description.
 */
function Breakdown({
  content,
  open,
  tipId,
  onOpen,
  onClose,
  children,
}: {
  content: TipContent;
  open: boolean;
  tipId: string;
  onOpen: (el: HTMLElement) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const pointer = useRef("mouse");
  if (content.items.length === 0) return <>{children}</>;
  return (
    <button
      type="button"
      data-tip={content.key}
      aria-expanded={open}
      aria-controls={open ? tipId : undefined}
      aria-describedby={open ? tipId : undefined}
      onPointerDown={(e) => {
        pointer.current = e.pointerType;
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onOpen(e.currentTarget);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onClose();
      }}
      onFocus={(e) => {
        // Keyboard focus only: a click or a tap focuses the button too, and a tap toggles below.
        if (e.currentTarget.matches(":focus-visible")) onOpen(e.currentTarget);
      }}
      onBlur={onClose}
      onClick={(e) => {
        // A mouse opened it on hover; a tap (or Enter after one) toggles it.
        if (pointer.current === "mouse") return;
        if (open) onClose();
        else onOpen(e.currentTarget);
      }}
      className={cn(
        "relative -mx-1 rounded-sm px-1 underline decoration-line-strong decoration-dotted underline-offset-3 pointer-fine:cursor-help",
        // A 44px hit area on touch without the row growing.
        "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3",
      )}
    >
      {children}
    </button>
  );
}
