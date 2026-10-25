"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Td } from "@/components/ui";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";
import { DealPriceField, DealStageField, DealTextField, DealUnitsField } from "./deal-fields";

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
 * A cell holding a field. The 28px field (44px on touch) keeps the row at
 * 40px (48px on touch) with its text on the same line as the plain cells'.
 */
const fieldCell = "py-1.5 pointer-coarse:py-px";
const field = "h-7";

export function DealRowEditable({ deal }: { deal: DealRow }) {
  // A short ok-tint flash on the row once a save lands.
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function saved() {
    clearTimeout(timer.current);
    setFlash(true);
    timer.current = setTimeout(() => setFlash(false), 700);
  }

  return (
    <tr className={cn("group/row transition-colors", flash ? "bg-ok-tint" : "hover:bg-fill-1")}>
      {/* The first cell starts on the page gutter, under the title (section 5). */}
      <Td className="pl-0">
        <div className="flex items-start gap-1.5">
          <Link href={`/deals/${deal.id}`} className="font-medium text-fg-1 hover:underline">
            {deal.address}
          </Link>
          {/* A mouse sees it on the row's hover; touch opens the listing from the deal page. */}
          {deal.sourceUrl && (
            <a
              href={deal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the listing"
              title={`Open ${deal.sourceUrl}`}
              className="mt-0.5 shrink-0 rounded-sm text-fg-3 opacity-0 transition-opacity hover:text-fg-1 focus-visible:opacity-100 group-hover/row:opacity-100 pointer-coarse:hidden"
            >
              <ExternalLink aria-hidden="true" className="size-4 stroke-[1.5]" />
            </a>
          )}
        </div>
      </Td>

      <Td className={fieldCell}>
        <DealStageField id={deal.id} status={deal.status} fieldSize="cell" onSaved={saved} />
      </Td>

      <Td numeric className={fieldCell}>
        <DealUnitsField id={deal.id} value={deal.units} align="right" className={field} onSaved={saved} />
      </Td>

      <Td numeric className={fieldCell}>
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
      <Td numeric className={fieldCell}>
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

      <Td className="text-meta text-fg-3">
        {deal.latestNotes.length > 0 && (
          <div className="space-y-0.5">
            {deal.latestNotes.map((n, i) => (
              <Tooltip key={i} label={n.day ? `${n.body} (${n.day})` : n.body} className="block truncate">
                <span className="truncate">{n.body}</span>
              </Tooltip>
            ))}
          </div>
        )}
      </Td>

      <Td className={fieldCell}>
        <DealTextField
          id={deal.id}
          value={deal.nextAction}
          patchKey="nextAction"
          label="Next action"
          placeholder="Add next action…"
          className={field}
          onSaved={saved}
        />
      </Td>

      <Td className="num truncate pr-0 text-meta text-fg-3">{deal.updated}</Td>
    </tr>
  );
}
