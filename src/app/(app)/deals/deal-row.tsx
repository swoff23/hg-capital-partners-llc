"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { DealStage } from "@/components/deal-stage";
import { Money } from "@/components/money";
import { StatusMenu } from "@/components/status-menu";
import { Tooltip } from "@/components/tooltip";
import { useToast } from "@/components/toast";
import { RowCell } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { dealStageLabel } from "@/lib/config";
import { cn } from "@/lib/utils";
import { patchDeal } from "./actions";
import { COLUMN_DROP } from "./columns";

export type DealRow = {
  id: string;
  address: string;
  status: string;
  units: number | null;
  theirPrice: number | null;
  theirPriceRaw: string | null;
  ourPrice: number | null;
  ourPriceRaw: string | null;
  nextAction: string | null;
  sourceUrl: string | null;
  /** The day it last changed, worked out on the server ("Oct 20"). */
  updated: string;
  /** The most recent note (typed or imported, never a change entry), without its author. `day` is null for an undated imported line. */
  latestNote: { text: string; day: string | null } | null;
};

const dash = <span className="text-fg-3">—</span>;

/** A price as the list shows it: the amount, or the words someone typed that aren't one number. */
function Price({ amount, raw }: { amount: number | null; raw: string | null }) {
  if (amount != null) return <Money value={amount} />;
  if (raw) return <span className="min-w-0 truncate">{raw}</span>;
  return dash;
}

/** A denser row than the portfolio's 56px: 40px with a mouse, 48 on touch (section 5, Density). */
const dense = "min-h-10 pointer-coarse:min-h-12";

/**
 * One deal in the list (forms 3.3 A): the row is the link, so a click, a tap,
 * cmd-click and middle-click open the deal, and the stage is the only control
 * in it. With a mouse the stage is a `StatusMenu` showing its ring and word,
 * with the chevron on the row's hover; a pick saves at once, flashes the row
 * and toasts "Moved to High" with Undo. On touch the stage is display only
 * and the row opens the deal, where every field is edited. A row has one tab
 * stop beside the stage, down from six controls.
 *
 * Where the list is narrower than 520px (a phone), only the address column
 * shows and the row is two lines, 60px on touch: the address, then the stage
 * and the asking price (docs/brand-guidelines.md, section 5, Density).
 * COLUMN_DROP in columns.ts says which columns show wider.
 */
export function DealListRow({ deal }: { deal: DealRow }) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [stage, setStage] = useOptimistic(deal.status);
  // A short ok-tint flash on the row once a save lands.
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const href = `/deals/${deal.id}`;

  /** A pick from the menu. Picking the stage it already has changes nothing. */
  function change(to: string) {
    if (to !== stage) move(to, stage);
  }

  /** The save, and the toast whose Undo is the same move the other way (so it never reads a stale `stage`). */
  function move(to: string, from: string) {
    startTransition(async () => {
      setStage(to);
      const res = await callAction(async () => {
        await patchDeal(deal.id, { status: to });
        return { ok: true as const, data: undefined };
      });
      if (!res.ok) {
        // The old stage comes back with the transition; say what didn't save.
        toast({ message: "Couldn't change the stage. Try again." });
        return;
      }
      clearTimeout(timer.current);
      setFlash(true);
      timer.current = setTimeout(() => setFlash(false), 700);
      toast({
        message: `Moved to ${dealStageLabel(to)}`,
        key: `deal:${deal.id}:stage`,
        action: { label: "Undo", onAction: () => move(from, to) },
      });
    });
  }

  const asking = <Price amount={deal.theirPrice} raw={deal.theirPriceRaw} />;
  // One note, led by its day ("Oct 20 · seeing tomorrow"); the tooltip has all of it.
  const note = deal.latestNote ? (deal.latestNote.day ? `${deal.latestNote.day} · ${deal.latestNote.text}` : deal.latestNote.text) : null;

  return (
    <tr className={cn("group/row transition-colors", flash ? "bg-ok-tint" : "hover:bg-fill-1")}>
      {/* The first cell starts on the page gutter, under the title (section 5). */}
      <RowCell
        href={href}
        first
        className={cn(dense, "flex-col items-start justify-center gap-0 pl-0 @max-[32.5rem]:py-2", deal.sourceUrl && "pr-8 @max-[32.5rem]:pr-0")}
        aside={
          deal.sourceUrl && (
            // A mouse sees it on the row's hover; touch, and the phone row, open the listing from the deal page.
            <a
              href={deal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the listing"
              title={`Open ${deal.sourceUrl}`}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-fg-3 opacity-0 transition-opacity hover:text-fg-1 focus-visible:opacity-100 group-hover/row:opacity-100 pointer-coarse:hidden @max-[32.5rem]:hidden"
            >
              <ExternalLink aria-hidden="true" className="size-4 stroke-[1.5]" />
            </a>
          )
        }
      >
        <span className="block max-w-full truncate font-medium text-fg-1">{deal.address}</span>
        {/* The phone row's subline: the stage leads it in its tone (section 9), then the asking price. */}
        <span className="mt-0.5 hidden max-w-full items-center gap-1.5 text-meta text-fg-3 @max-[32.5rem]:flex">
          <DealStage stage={stage} label={dealStageLabel(stage)} className="shrink-0" />
          {(deal.theirPrice != null || deal.theirPriceRaw) && (
            <>
              <span aria-hidden="true">·</span>
              {asking}
            </>
          )}
        </span>
      </RowCell>

      {/* 2px in, so the ring lands 12px from the cell's edge under the column's label (the trigger pads 10). */}
      <RowCell href={href} cell={COLUMN_DROP.status} className={cn(dense, "pl-0.5")}>
        {/* The only control in the row, above the row's link. Touch shows the stage and the row opens the deal. */}
        <div className="relative z-10 min-w-0 pointer-coarse:hidden">
          <StatusMenu kind="stage" value={stage} onChange={change} chevron="hover" />
        </div>
        <DealStage stage={stage} label={dealStageLabel(stage)} className="hidden text-meta pointer-coarse:inline-flex pointer-coarse:pl-2.5" />
      </RowCell>

      <RowCell href={href} numeric cell={COLUMN_DROP.units} className={dense}>
        {deal.units ?? dash}
      </RowCell>
      <RowCell href={href} numeric cell={COLUMN_DROP.theirPrice} className={dense}>
        {asking}
      </RowCell>
      <RowCell href={href} numeric cell={COLUMN_DROP.ourPrice} className={dense}>
        <Price amount={deal.ourPrice} raw={deal.ourPriceRaw} />
      </RowCell>

      {/* The latest note alone, so the row stays 40px; its tooltip carries the whole of it. */}
      <RowCell href={href} cell={COLUMN_DROP.latestNote} className={cn(dense, "text-meta text-fg-3")}>
        {note ? (
          <div className="relative z-10 min-w-0">
            <Tooltip label={note} className="block truncate">
              <Link href={href} tabIndex={-1} className="block truncate">
                {note}
              </Link>
            </Tooltip>
          </div>
        ) : (
          <span aria-label="No notes">—</span>
        )}
      </RowCell>

      {/* A blank cell when there's no next action: the deal page keeps the verb. */}
      <RowCell href={href} cell={COLUMN_DROP.nextAction} className={cn(dense, "text-body text-fg-1")}>
        <span className="truncate">{deal.nextAction}</span>
      </RowCell>

      <RowCell href={href} cell={COLUMN_DROP.updated} className={cn(dense, "num pr-0 text-meta text-fg-3")}>
        <span className="truncate">{deal.updated}</span>
      </RowCell>
    </tr>
  );
}
