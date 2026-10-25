"use client";
import { useState, useTransition } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { InlineAddressField } from "@/components/inline-address-field";
import { chromeIconClass } from "@/components/nav";
import { Select, buttonClass } from "@/components/ui";
import { DEAL_PASS_REASONS } from "@/lib/config";
import { cn } from "@/lib/utils";
import { patchDeal } from "../actions";
import { DealTextField } from "../deal-fields";

/* ------------------------------------------------------------------ *
 * Address: the page's h1, edited in place
 * ------------------------------------------------------------------ */

export function AddressField({ id, value }: { id: string; value: string }) {
  return <InlineAddressField heading value={value} onCommit={(address) => patchDeal(id, { address })} />;
}

/* ------------------------------------------------------------------ *
 * Pass reason: only rendered by the page when the stage is Pass
 * ------------------------------------------------------------------ */

export function PassReasonControl({ id, value }: { id: string; value: string | null }) {
  const [pending, start] = useTransition();
  const [shown, setShown] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setShown(value ?? "");
  }

  // Dims while the save runs but stays enabled, so a keyboard user keeps focus (as DealStageField does).
  return (
    <div className={cn("relative min-w-0 transition-opacity", pending && "opacity-50")}>
      <Select
        aria-label="Pass reason"
        value={shown}
        aria-busy={pending || undefined}
        onChange={(e) => {
          setShown(e.target.value);
          start(() => patchDeal(id, { passReason: e.target.value || null }));
        }}
        className={cn("h-8 appearance-none truncate pr-7", !shown && "text-fg-3")}
      >
        <option value="">—</option>
        {DEAL_PASS_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </Select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Listing URL: edited in place, with a button that opens it
 * ------------------------------------------------------------------ */

export function ListingUrlField({ id, value }: { id: string; value: string | null }) {
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <DealTextField
          id={id}
          value={value}
          patchKey="sourceUrl"
          label="Listing URL"
          placeholder="Paste a listing URL…"
          type="url"
          className="h-8"
        />
      </div>
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the listing"
          title={`Open ${value}`}
          className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-fg-3")}
        >
          <ExternalLink aria-hidden="true" className={chromeIconClass} />
        </a>
      )}
    </div>
  );
}
