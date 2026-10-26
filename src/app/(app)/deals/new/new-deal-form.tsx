"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button, Input, TextLink } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { DEFAULT_DEAL_STATUS, dealStatusLabel } from "@/lib/config";
import { cn } from "@/lib/utils";
import { createDeal, type ExistingDeal } from "../actions";
import { StageSelect } from "../stage-select";

/** A label over its field: text-meta 500 in --fg-2, 6px above it (section 9, Inputs). */
function Label({ text, className, children }: { text: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-meta font-medium text-fg-2">{text}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

/**
 * Posts without a page load, so a refusal keeps every field as typed: an
 * address that's already a deal says so on one line under the field and
 * links to it, and focus moves to the field, so someone who just tapped
 * Create deal at the bottom of a phone screen is taken to it (and a screen
 * reader reads the line, through aria-describedby).
 */
export function NewDealForm({ defaultAddress }: { defaultAddress?: string }) {
  const [pending, start] = useTransition();
  const [existing, setExisting] = useState<ExistingDeal | null>(null);
  const [error, setError] = useState("");
  const address = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing) address.current?.focus();
  }, [existing]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError("");
    start(async () => {
      const res = await callAction(() => createDeal(data));
      // A new deal redirects to its page (callAction lets it through); only a refusal comes back.
      if (!res.ok) setError(res.error);
      else setExisting(res.data.duplicateOf);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label text="Address *">
          <Input
            ref={address}
            name="address"
            required
            defaultValue={defaultAddress}
            placeholder="123 Main St, Buffalo, NY 14201"
            aria-invalid={existing ? true : undefined}
            aria-describedby={existing ? "new-deal-existing" : undefined}
            onChange={() => setExisting(null)}
          />
        </Label>
        {existing && (
          // One line at 320: the field above already shows the address.
          <p id="new-deal-existing" className="mt-1.5 text-meta text-danger">
            Already a deal · {dealStatusLabel(existing.status)}.{" "}
            <TextLink href={`/deals/${existing.id}`} className="whitespace-nowrap font-medium">
              Open it
            </TextLink>
          </p>
        )}
      </div>
      {/* Two to a row from sm; one below, so no label wraps at 320. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-3">
        <Label text="Status">
          <StageSelect name="status" defaultValue={DEFAULT_DEAL_STATUS} />
        </Label>
        <Label text="Units">
          <Input name="units" type="number" inputMode="numeric" min="1" />
        </Label>
        <Label text="Their price">
          <Input name="theirPriceRaw" placeholder="425k" />
        </Label>
        <Label text="Our price (target/max)">
          <Input name="ourPriceRaw" placeholder="380k" />
        </Label>
      </div>
      <Label text="Listing URL">
        <Input name="sourceUrl" type="url" placeholder="https://…" />
      </Label>
      <Label text="Next action">
        <Input name="nextAction" placeholder="Run comps, schedule tour…" />
      </Label>
      <div className="space-y-1.5">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create deal"}
        </Button>
        {error && <p className="text-meta text-danger">{error}</p>}
      </div>
    </form>
  );
}
