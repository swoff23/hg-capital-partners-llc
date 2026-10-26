"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileBadge, Hammer, Landmark, RefreshCw, ShieldCheck, Unplug, type LucideIcon } from "lucide-react";
import { Money } from "@/components/money";
import { Section, chromeIconClass } from "@/components/ui";
import { PHONE_ROWS, moreCount, type NeedsYouItem, type NeedsYouKind } from "@/lib/home/needs-you";
import { cn } from "@/lib/utils";

/** The lucide icon of the thing (docs/brand-guidelines.md, section 9). */
const ICON: Record<NeedsYouKind, LucideIcon> = {
  loan: Landmark,
  insurance: ShieldCheck,
  registration: FileBadge,
  capex: Hammer,
  "sync-stale": RefreshCw,
  "sync-lost": Unplug,
};

/**
 * Home's Needs you list (docs/home-as-today.md): one row per item, each
 * opening its record. Wide rows set the thing's icon and one word in a fixed
 * column, then the title over the place, then the date. Below 480px a row
 * keeps two lines: the word leads the subline and the date ends it. On a
 * phone the list shows three rows, then "N more".
 */
export function NeedsYou({ items, className }: { items: NeedsYouItem[]; className?: string }) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const more = moreCount(items.length);

  function showAll() {
    setAll(true);
    // The button goes away, so focus moves to the first row it showed.
    requestAnimationFrame(() => list.current?.querySelectorAll("a")[PHONE_ROWS]?.focus());
  }

  return (
    <Section title="Needs you" className={className}>
      <ul ref={list} className="@container divide-y divide-line">
        {items.map((item, i) => (
          <li key={item.key} className={cn(!all && i >= PHONE_ROWS && "max-sm:hidden")}>
            <Row item={item} />
          </li>
        ))}
      </ul>
      {/* No rule of its own: the third row's divider already sets it off. */}
      {more > 0 && !all && (
        <button
          type="button"
          onClick={showAll}
          className="flex min-h-10 w-full items-center text-left text-label text-fg-2 transition-colors hover:text-fg-1 pointer-coarse:min-h-12 sm:hidden"
        >
          {more} more
        </button>
      )}
    </Section>
  );
}

function Row({ item }: { item: NeedsYouItem }) {
  const Icon = ICON[item.kind];
  const date = item.dateLabel && <span className={item.late ? "text-danger" : undefined}>{item.dateLabel}</span>;

  return (
    <Link
      href={item.href}
      className={cn(
        // The hover fill reaches 8px past each side, rounded, as on the task rows beside it.
        "-mx-2 grid min-h-10 grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2 py-2 transition-colors hover:bg-fill-1 pointer-coarse:min-h-12",
        "@min-[30rem]:grid-cols-[7rem_minmax(0,1fr)_auto_auto] @min-[30rem]:items-center",
      )}
    >
      {/* The mark: the thing's icon in --warn, and from 480px its one word. */}
      <span className="mt-[3px] inline-flex items-center gap-1.5 whitespace-nowrap text-meta font-medium text-warn @min-[30rem]:mt-0">
        <Icon aria-hidden="true" strokeWidth={2} className="size-3.5 shrink-0 pointer-coarse:size-4" />
        <span className="hidden @min-[30rem]:inline">{item.state}</span>
      </span>

      <span className="min-w-0">
        <span className="block text-body text-fg-1">{item.title}</span>
        <span className="flex min-w-0 text-meta text-fg-3">
          <span className="shrink-0 whitespace-pre text-warn @min-[30rem]:hidden">{`${item.state} · `}</span>
          {/* An amount leads the subline, where nothing cuts it; a late part follows in --danger. Under a
              360px list the detail ("across 4 properties") drops instead of truncating, and only a very
              long amount line is cut, after the amount, before the chevron. */}
          {item.amount != null && (
            <span className="min-w-0 truncate whitespace-pre">
              <Money value={item.amount} />
              {item.pastDue != null && (
                <>
                  {" · "}
                  <span className="text-danger">
                    <Money value={item.pastDue} /> past due
                  </span>
                </>
              )}
            </span>
          )}
          <span className={cn("min-w-0 truncate whitespace-pre", item.amount != null && "@max-[22.5rem]:hidden")}>
            {item.amount != null && (item.pastDue != null ? " · " : " ")}
            {item.detail}
          </span>
          {date && <span className="shrink-0 whitespace-pre @min-[30rem]:hidden">{" · "}{date}</span>}
        </span>
      </span>

      {/* From 480px the date sits in its own column, right-aligned so the rows line up. */}
      <span className="num hidden whitespace-nowrap text-right text-meta text-fg-2 @min-[30rem]:block">{date}</span>

      <ChevronRight aria-hidden="true" className={cn(chromeIconClass, "self-center text-fg-3")} />
    </Link>
  );
}
