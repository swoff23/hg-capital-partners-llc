"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Td, badgeToneClass } from "@/components/ui";
import { Tooltip } from "@/components/tooltip";
import { DEAL_STATUSES, dealStatusTone } from "@/lib/config";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { patchDeal } from "./actions";

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
  updatedAt: string;
  /** Most recent notes (typed or imported, never change entries), newest first: 0, 1, or 2. `date` is null for an undated imported line. */
  latestNotes: { body: string; date: string | null }[];
};

function priceDisplay(n: number | null, raw: string | null): string {
  return n != null ? fmtMoney(n) : (raw ?? "");
}

const cell =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none hover:border-border focus:border-primary focus:bg-surface";

/**
 * A price field. Touch screens give every field 16px text (globals.css) so
 * iOS doesn't zoom on focus, and at 16px a six-figure price no longer fits
 * the column. So on touch the figure is drawn at the list's size over the
 * field, and the field's own text shows only while it's being edited. A
 * mouse sees the plain field.
 */
function PriceCell({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const [typed, setTyped] = useState(value);
  return (
    <div className="relative">
      <input
        defaultValue={value}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={(e) => onSave(e.target.value)}
        placeholder="—"
        className={`${cell} peer tabular-nums pointer-coarse:text-transparent pointer-coarse:focus:text-foreground`}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden items-center overflow-hidden border border-transparent px-1 text-xs tabular-nums pointer-coarse:flex pointer-coarse:peer-focus:hidden"
      >
        <span className={typed ? "truncate" : "truncate text-muted"}>{typed || "—"}</span>
      </span>
    </div>
  );
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

  // Normally the dropdown is just DEAL_STATUSES in pipeline order. Only prepend deal.status
  // when it's a legacy value no longer in that list, so it still shows up as selected.
  const statusOptions: readonly string[] = (DEAL_STATUSES as readonly string[]).includes(deal.status)
    ? DEAL_STATUSES
    : [deal.status, ...DEAL_STATUSES];
  const theirPrice = priceDisplay(deal.theirPrice, deal.theirPriceRaw);
  const ourPrice = priceDisplay(deal.ourPrice, deal.ourPriceRaw);

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
              title={`Open ${deal.sourceUrl}`}
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
          className={`rounded-sm px-1.5 py-0.5 text-micro ring-1 ring-inset ring-line-control ${badgeToneClass(dealStatusTone(deal.status))}`}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Td>

      <Td>
        <input
          key={`u-${deal.units}`}
          type="number"
          min={0}
          defaultValue={deal.units ?? ""}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const parsed = raw === "" ? null : Number.parseInt(raw, 10);
            const next = parsed != null && Number.isNaN(parsed) ? deal.units : parsed;
            save({ units: next }, deal.units, next);
          }}
          placeholder="—"
          className={`${cell} tabular-nums`}
        />
      </Td>

      <Td>
        <PriceCell
          key={`tp-${deal.theirPrice}-${deal.theirPriceRaw}`}
          value={theirPrice}
          onSave={(next) => save({ theirPriceRaw: next }, theirPrice, next)}
        />
      </Td>
      <Td>
        <PriceCell
          key={`op-${deal.ourPrice}-${deal.ourPriceRaw}`}
          value={ourPrice}
          onSave={(next) => save({ ourPriceRaw: next }, ourPrice, next)}
        />
      </Td>

      <Td className="text-xs text-muted">
        {deal.latestNotes.length > 0 && (
          <div className="space-y-0.5">
            {deal.latestNotes.map((n, i) => (
              <Tooltip key={i} label={n.date ? `${n.body} (${fmtDate(n.date)})` : n.body} className="block truncate">
                <span className="truncate">{n.body}</span>
              </Tooltip>
            ))}
          </div>
        )}
      </Td>

      <Td>
        <input
          defaultValue={deal.nextAction ?? ""}
          onBlur={(e) => save({ nextAction: e.target.value }, deal.nextAction, e.target.value)}
          placeholder="Add next action…"
          className={cell}
        />
      </Td>

      <Td className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted">
        {fmtDate(deal.updatedAt)}
      </Td>
    </tr>
  );
}
