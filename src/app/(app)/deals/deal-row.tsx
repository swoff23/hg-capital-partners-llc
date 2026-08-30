"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Td } from "@/components/ui";
import { DEAL_STATUSES, dealStatusTone, priorityTone } from "@/lib/config";
import { fmtDate, relativeDays } from "@/lib/utils";
import { patchDeal } from "./actions";

export type DealRow = {
  id: string;
  address: string;
  status: string;
  priority: string | null;
  vip: boolean;
  theirPriceRaw: string | null;
  ourPriceRaw: string | null;
  nextAction: string | null;
  nextActionDue: string | null; // yyyy-mm-dd
  sourceUrl: string | null;
  noteCount: number;
  taskCount: number;
  updatedAt: string;
};

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

  return (
    <tr className={`hover:bg-background ${pending ? "opacity-60" : ""} ${flash ? "bg-green-50" : ""}`}>
      <Td>
        <Link href={`/deals/${deal.id}`} className="font-medium hover:underline">
          {deal.address}
        </Link>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          {deal.priority && <Badge tone={priorityTone(deal.priority)}>{deal.priority}</Badge>}
          {deal.vip && <Badge tone="purple">VIP</Badge>}
          {deal.noteCount > 0 && <span>{deal.noteCount} notes</span>}
          {deal.taskCount > 0 && <span>· {deal.taskCount} tasks</span>}
        </div>
      </Td>

      <Td>
        <select
          defaultValue={deal.status}
          onChange={(e) => save({ status: e.target.value }, deal.status, e.target.value)}
          className={`rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass(dealStatusTone(deal.status))}`}
        >
          {[...new Set([deal.status, ...DEAL_STATUSES])].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Td>

      <Td className="text-right">
        <input
          defaultValue={deal.theirPriceRaw ?? ""}
          onBlur={(e) => save({ theirPriceRaw: e.target.value }, deal.theirPriceRaw, e.target.value)}
          placeholder="—"
          className={`${cell} text-right tabular-nums`}
        />
      </Td>
      <Td className="text-right">
        <input
          defaultValue={deal.ourPriceRaw ?? ""}
          onBlur={(e) => save({ ourPriceRaw: e.target.value }, deal.ourPriceRaw, e.target.value)}
          placeholder="—"
          className={`${cell} text-right tabular-nums`}
        />
      </Td>

      <Td className="min-w-[220px]">
        <input
          defaultValue={deal.nextAction ?? ""}
          onBlur={(e) => save({ nextAction: e.target.value }, deal.nextAction, e.target.value)}
          placeholder="Add next action…"
          className={cell}
        />
        <div className="mt-0.5 flex items-center gap-1">
          <input
            type="date"
            defaultValue={deal.nextActionDue ?? ""}
            onChange={(e) => save({ nextActionDue: e.target.value }, deal.nextActionDue, e.target.value)}
            className="rounded border border-transparent px-1 text-[11px] text-muted hover:border-border focus:border-primary"
          />
          {deal.nextActionDue && (
            <span className={new Date(deal.nextActionDue) < new Date() ? "text-[11px] text-red-600" : "text-[11px] text-muted"}>
              {relativeDays(deal.nextActionDue)}
            </span>
          )}
        </div>
      </Td>

      <Td className="min-w-[160px]">
        <div className="flex items-center gap-1">
          <input
            defaultValue={deal.sourceUrl ?? ""}
            onBlur={(e) => save({ sourceUrl: e.target.value }, deal.sourceUrl, e.target.value)}
            placeholder="Listing URL…"
            className={cell}
          />
          {deal.sourceUrl && (
            <a
              href={deal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-primary"
              title={deal.sourceUrl}
            >
              ↗
            </a>
          )}
        </div>
      </Td>

      <Td className="whitespace-nowrap text-xs text-muted">{fmtDate(deal.updatedAt)}</Td>
    </tr>
  );
}

function toneClass(tone: string): string {
  return (
    {
      gray: "bg-zinc-100 text-zinc-700 ring-zinc-200",
      blue: "bg-blue-50 text-blue-700 ring-blue-200",
      green: "bg-green-50 text-green-700 ring-green-200",
      amber: "bg-amber-50 text-amber-700 ring-amber-200",
      red: "bg-red-50 text-red-700 ring-red-200",
      purple: "bg-purple-50 text-purple-700 ring-purple-200",
    }[tone] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200"
  );
}
