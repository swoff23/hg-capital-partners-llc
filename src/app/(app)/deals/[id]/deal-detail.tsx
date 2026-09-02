"use client";
import { useState, useTransition } from "react";
import { InlineAddressField } from "@/components/inline-address-field";
import { DEAL_STATUSES, DEAL_PASS_REASONS, dealStatusTone, toneClass } from "@/lib/config";
import { cn } from "@/lib/utils";
import { patchDeal } from "../actions";

/** Quiet inline control: no border at rest, fills on hover/focus. */
const quiet =
  "-mx-2 w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-foreground outline-none transition-colors hover:bg-background focus:bg-background focus:ring-2 focus:ring-primary/20 disabled:opacity-40";

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 4.5L6 7.5l3-3" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Address — page heading, editable in place
 * ------------------------------------------------------------------ */

export function AddressField({ id, value }: { id: string; value: string }) {
  return <InlineAddressField value={value} onCommit={(address) => patchDeal(id, { address })} />;
}

/* ------------------------------------------------------------------ *
 * Status — the primary workflow control, styled like a colored badge
 * ------------------------------------------------------------------ */

export function StatusControl({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  // Normally just DEAL_STATUSES in pipeline order. Only prepend `status` when it's a legacy
  // value no longer in that list, so it still shows up as selected.
  const statusOptions: readonly string[] = (DEAL_STATUSES as readonly string[]).includes(status)
    ? DEAL_STATUSES
    : [status, ...DEAL_STATUSES];
  return (
    <div className="relative inline-block">
      <select
        aria-label="Status"
        value={status}
        disabled={pending}
        onChange={(e) => start(() => patchDeal(id, { status: e.target.value }))}
        className={cn(
          "appearance-none rounded-md py-1 pl-2.5 pr-7 text-sm font-medium outline-none ring-1 ring-inset transition-opacity",
          toneClass(dealStatusTone(status)),
          pending && "opacity-60",
        )}
      >
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 4.5L6 7.5l3-3" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pass reason — only rendered by the page when status is "Pass"
 * ------------------------------------------------------------------ */

export function PassReasonControl({ id, value }: { id: string; value: string | null }) {
  const [pending, start] = useTransition();
  return (
    <div className="relative">
      <select
        aria-label="Pass reason"
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => start(() => patchDeal(id, { passReason: e.target.value || null }))}
        className={cn(quiet, "appearance-none pr-7", !value && "text-muted")}
      >
        <option value="">—</option>
        {DEAL_PASS_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <Chevron />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Text field — shared by price / next action / units / listing URL
 * ------------------------------------------------------------------ */

function TextField({
  id,
  value,
  placeholder,
  patchKey,
  type = "text",
}: {
  id: string;
  value: string;
  placeholder?: string;
  patchKey: "theirPriceRaw" | "ourPriceRaw" | "nextAction" | "sourceUrl";
  type?: string;
}) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  const [pending, start] = useTransition();
  if (value !== seen) {
    setSeen(value);
    setV(value);
  }

  function commit() {
    const trimmed = v.trim();
    if (trimmed === value.trim()) return;
    const patch = { [patchKey]: trimmed || null } as Parameters<typeof patchDeal>[1];
    start(() => patchDeal(id, patch));
  }

  return (
    <input
      aria-label={patchKey}
      type={type}
      value={v}
      disabled={pending}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setV(value);
          e.currentTarget.blur();
        }
      }}
      className={cn(quiet, !v && "text-muted")}
    />
  );
}

export function PriceField({
  id,
  value,
  which,
}: {
  id: string;
  value: string | null;
  which: "their" | "our";
}) {
  return (
    <TextField
      id={id}
      value={value ?? ""}
      placeholder="—"
      patchKey={which === "their" ? "theirPriceRaw" : "ourPriceRaw"}
    />
  );
}

export function NextActionField({ id, value }: { id: string; value: string | null }) {
  return (
    <TextField id={id} value={value ?? ""} placeholder="What's next?" patchKey="nextAction" />
  );
}

/* ------------------------------------------------------------------ *
 * Units — plain integer field
 * ------------------------------------------------------------------ */

export function UnitsField({ id, value }: { id: string; value: number | null }) {
  const [v, setV] = useState(value?.toString() ?? "");
  const [seen, setSeen] = useState(value);
  const [pending, start] = useTransition();
  if (value !== seen) {
    setSeen(value);
    setV(value?.toString() ?? "");
  }

  function commit() {
    const trimmed = v.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    const next = parsed != null && Number.isNaN(parsed) ? value : parsed;
    if (next !== value) start(() => patchDeal(id, { units: next }));
    setV(next?.toString() ?? "");
  }

  return (
    <input
      aria-label="Units"
      type="number"
      min={0}
      value={v}
      disabled={pending}
      placeholder="—"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setV(value?.toString() ?? "");
          e.currentTarget.blur();
        }
      }}
      className={cn(quiet, !v && "text-muted")}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Listing URL — editable, plus an "open" affordance when set
 * ------------------------------------------------------------------ */

export function ListingUrlField({ id, value }: { id: string; value: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <TextField
          id={id}
          value={value ?? ""}
          placeholder="Paste a listing URL…"
          patchKey="sourceUrl"
          type="url"
        />
      </div>
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open listing — ${value}`}
          className="shrink-0 rounded border border-border px-1.5 py-1 text-xs text-primary hover:bg-background"
        >
          Open ↗
        </a>
      )}
    </div>
  );
}
