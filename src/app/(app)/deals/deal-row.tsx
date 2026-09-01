"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Td } from "@/components/ui";
import { Tooltip } from "@/components/tooltip";
import { DEAL_STATUSES, dealStatusTone, toneClass } from "@/lib/config";
import { fmtDate } from "@/lib/utils";
import { patchDeal } from "./actions";

export type DealRow = {
  id: string;
  address: string;
  status: string;
  theirPrice: number | null;
  theirPriceRaw: string | null;
  ourPrice: number | null;
  ourPriceRaw: string | null;
  nextAction: string | null;
  sourceUrl: string | null;
  updatedAt: string;
  /** Most recent manual activity notes, newest first — 0, 1, or 2 entries. */
  latestNotes: { body: string; date: string }[];
};

function priceDisplay(n: number | null, raw: string | null): string {
  if (n != null) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return raw ?? "";
}

export function DealRowEditable({ deal }: { deal: DealRow }) {
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState(false);

  function save(patch: Parameters<typeof patchDeal>[1], prev: unknown, nextVal: unknown) {
    if (String(prev ?? "") === String(nextVal ?? "")) return;
    start(async () => {
      await patchDeal(deal.id, patch);
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
    });
  }

  const cell =
    "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none hover:border-border focus:border-primary focus:bg-surface";

  // Normally the dropdown is just DEAL_STATUSES in pipeline order. Only prepend deal.status
  // when it's a legacy value no longer in that list, so it still shows up as selected.
  const statusOptions: readonly string[] = (DEAL_STATUSES as readonly string[]).includes(deal.status)
    ? DEAL_STATUSES
    : [deal.status, ...DEAL_STATUSES];

  return (
    <tr className={`hover:bg-background ${pending ? "opacity-60" : ""} ${flash ? "bg-green-500/10" : ""}`}>
      <Td>
        <div className="group/addr flex items-center gap-1.5">
          <Link href={`/deals/${deal.id}`} className="font-medium hover:underline">
            {deal.address}
          </Link>
          {deal.sourceUrl && (
            <a
              href={deal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open listing — ${deal.sourceUrl}`}
              className="shrink-0 rounded border border-border px-1 text-[11px] leading-4 text-primary opacity-0 transition-opacity hover:bg-background focus-visible:opacity-100 group-hover/addr:opacity-100"
            >
              ↗
            </a>
          )}
        </div>
      </Td>

      <Td>
        <select
          defaultValue={deal.status}
          onChange={(e) => save({ status: e.target.value }, deal.status, e.target.value)}
          className={`rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass(dealStatusTone(deal.status))}`}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Td>

      <Td className="text-right">
        <input
          key={`tp-${deal.theirPrice}-${deal.theirPriceRaw}`}
          defaultValue={priceDisplay(deal.theirPrice, deal.theirPriceRaw)}
          onBlur={(e) =>
            save({ theirPriceRaw: e.target.value }, priceDisplay(deal.theirPrice, deal.theirPriceRaw), e.target.value)
          }
          placeholder="—"
          className={`${cell} text-right tabular-nums`}
        />
      </Td>
      <Td className="text-right">
        <input
          key={`op-${deal.ourPrice}-${deal.ourPriceRaw}`}
          defaultValue={priceDisplay(deal.ourPrice, deal.ourPriceRaw)}
          onBlur={(e) =>
            save({ ourPriceRaw: e.target.value }, priceDisplay(deal.ourPrice, deal.ourPriceRaw), e.target.value)
          }
          placeholder="—"
          className={`${cell} text-right tabular-nums`}
        />
      </Td>

      <Td className="max-w-[240px] text-xs text-muted">
        {deal.latestNotes.length > 0 && (
          <div className="space-y-0.5">
            {deal.latestNotes.map((n, i) => (
              <Tooltip key={i} label={`${fmtDate(n.date)} — ${n.body}`} className="block truncate">
                <span className="truncate">{n.body}</span>
              </Tooltip>
            ))}
          </div>
        )}
      </Td>

      <Td className="min-w-[220px]">
        <input
          defaultValue={deal.nextAction ?? ""}
          onBlur={(e) => save({ nextAction: e.target.value }, deal.nextAction, e.target.value)}
          placeholder="Add next action…"
          className={cell}
        />
      </Td>

      <Td className="whitespace-nowrap text-xs text-muted">{fmtDate(deal.updatedAt)}</Td>
    </tr>
  );
}
