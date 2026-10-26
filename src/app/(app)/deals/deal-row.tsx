"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Money } from "@/components/money";
import { Td } from "@/components/ui";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";
import { COLUMN_DROP } from "./columns";
import { DealPriceField, DealStageField, DealTextField, DealUnitsField } from "./deal-fields";
import { DealStage } from "@/components/deal-stage";

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
  /** Most recent notes (typed or imported, never change entries), newest first: 0, 1, or 2. `day` is null for an undated imported line. */
  latestNotes: { body: string; day: string | null }[];
};

/**
 * A cell holding a field. Its 3px side inset, the field's 1px edge and its
 * 8px padding put the field's text 12px in from the cell's edge, where the
 * header's label and a plain cell's text sit. The 28px field (44px on touch)
 * keeps the row at 40px (48px on touch) with its text on the same line as
 * the plain cells'.
 */
const fieldCell = "px-0.75 py-1.5 pointer-coarse:py-px";
const field = "h-7";

/**
 * One deal in the list. Where the list is narrower than 520px (a phone),
 * only the address column shows and the row is two lines, 60px on touch:
 * the address, then the stage and their price (docs/brand-guidelines.md,
 * section 5, Density), and the whole row opens the deal, where its fields
 * are edited. Wider, each field edits in place (COLUMN_DROP in columns.ts
 * says which columns show).
 */
export function DealRowEditable({ deal }: { deal: DealRow }) {
  // A short ok-tint flash on the row once a save lands.
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function saved() {
    clearTimeout(timer.current);
    setFlash(true);
    timer.current = setTimeout(() => setFlash(false), 700);
  }

  // Text that isn't one number shows as typed, as it does in the price field.
  const price =
    deal.theirPrice != null ? (
      <Money value={deal.theirPrice} />
    ) : deal.theirPriceRaw ? (
      <span className="min-w-0 truncate">{deal.theirPriceRaw}</span>
    ) : null;

  return (
    <tr className={cn("group/row transition-colors", flash ? "bg-ok-tint" : "hover:bg-fill-1")}>
      {/* The first cell starts on the page gutter, under the title (section 5). */}
      <Td className="relative pl-0 @max-[32.5rem]:py-2 @max-[32.5rem]:pointer-coarse:py-2">
        <div className="flex items-start gap-1.5">
          <Link
            href={`/deals/${deal.id}`}
            className="min-w-0 font-medium text-fg-1 hover:underline @max-[32.5rem]:truncate @max-[32.5rem]:after:absolute @max-[32.5rem]:after:inset-0"
          >
            {deal.address}
          </Link>
          {/* A mouse sees it on the row's hover; touch, and the phone row, open the listing from the deal page. */}
          {deal.sourceUrl && (
            <a
              href={deal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the listing"
              title={`Open ${deal.sourceUrl}`}
              className="mt-0.5 shrink-0 rounded-sm text-fg-3 opacity-0 transition-opacity hover:text-fg-1 focus-visible:opacity-100 group-hover/row:opacity-100 pointer-coarse:hidden @max-[32.5rem]:hidden"
            >
              <ExternalLink aria-hidden="true" className="size-4 stroke-[1.5]" />
            </a>
          )}
        </div>
        {/* The phone row's subline: the stage leads it in its tone (section 9), then their price. */}
        <div className="mt-0.5 hidden min-w-0 items-center gap-1.5 text-meta text-fg-3 @max-[32.5rem]:flex">
          <DealStage stage={deal.status} className="shrink-0" />
          {price && (
            <>
              <span aria-hidden="true">·</span>
              {price}
            </>
          )}
        </div>
      </Td>

      <Td className={cn(fieldCell, COLUMN_DROP.status)}>
        <DealStageField id={deal.id} status={deal.status} fieldSize="cell" onSaved={saved} />
      </Td>

      <Td numeric className={cn(fieldCell, COLUMN_DROP.units)}>
        <DealUnitsField id={deal.id} value={deal.units} align="right" className={field} onSaved={saved} />
      </Td>

      <Td numeric className={cn(fieldCell, COLUMN_DROP.theirPrice)}>
        <DealPriceField
          id={deal.id}
          which="their"
          raw={deal.theirPriceRaw}
          amount={deal.theirPrice}
          align="right"
          className={field}
          onSaved={saved}
        />
      </Td>
      <Td numeric className={cn(fieldCell, COLUMN_DROP.ourPrice)}>
        <DealPriceField
          id={deal.id}
          which="our"
          raw={deal.ourPriceRaw}
          amount={deal.ourPrice}
          align="right"
          className={field}
          onSaved={saved}
        />
      </Td>

      {/* An empty cell is the dash in --fg-3, like units and prices (section 3). The latest note
          alone, so the row stays 40px; its tooltip carries both, newest first, a line each. */}
      <Td className={cn("text-meta text-fg-3", COLUMN_DROP.latestNote)}>
        {deal.latestNotes.length === 0 ? (
          <span aria-label="No notes">—</span>
        ) : (
          <Tooltip
            label={deal.latestNotes.map((n) => (n.day ? `${n.body} (${n.day})` : n.body)).join("\n")}
            className="block truncate"
          >
            <span className="truncate">{deal.latestNotes[0].body}</span>
          </Tooltip>
        )}
      </Td>

      <Td className={cn(fieldCell, COLUMN_DROP.nextAction)}>
        <DealTextField
          id={deal.id}
          value={deal.nextAction}
          patchKey="nextAction"
          label="Next action"
          // The list's empty cell is the dash; it still opens on a click or tap. The deal page keeps the verb.
          placeholder="—"
          className={field}
          onSaved={saved}
        />
      </Td>

      <Td className={cn("num truncate pr-0 text-meta text-fg-3", COLUMN_DROP.updated)}>{deal.updated}</Td>
    </tr>
  );
}
