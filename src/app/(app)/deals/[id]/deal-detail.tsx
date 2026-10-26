"use client";
import { useOptimistic } from "react";
import { ExternalLink } from "lucide-react";
import { InlineField, type InlineFieldProps } from "@/components/inline-field";
import { RailFact } from "@/components/rail";
import { StatusMenu } from "@/components/status-menu";
import { buttonClass, chromeIconClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { DEAL_FIELD_LABEL, DEAL_PASS_REASONS, dealStageLabel } from "@/lib/config";
import { cn } from "@/lib/utils";
import { saveDealFields } from "../actions";

/**
 * The deal page's editing pieces (forms 4.3): the address as its h1, the facts
 * of the rail, the stage, the pass reason. Each is an `InlineField` saved
 * through `saveDealFields` with the text it loaded, so a partner's newer
 * change to that field refuses the save and says who made it and when, where
 * before a stale page silently wrote over it.
 */

/** The page's h1, with the address field's suggestions and its duplicate line. */
export function DealAddress({ id, value }: { id: string; value: string }) {
  return (
    <InlineField
      kind="heading"
      label={DEAL_FIELD_LABEL.address}
      field="address"
      context="Deal address"
      value={value}
      minLength={4}
      blank="Enter the address."
      tooShort="Enter the full street address, like 123 Main St."
      address={{ kind: "deal", excludeId: id }}
      onSave={(address, expected) => saveDealFields(id, { address }, { address: expected })}
    />
  );
}

type FactProps = Omit<InlineFieldProps, "label" | "onSave" | "field" | "value"> & {
  id: string;
  /** The deal column the patch carries: "theirPriceRaw". */
  field: "theirPriceRaw" | "ourPriceRaw" | "nextAction" | "sourceUrl" | "passReason";
  label: string;
  value: string | null;
};

/** One text or price fact in the deal's rail. */
export function DealFact({ id, field, label, value, ...rest }: FactProps) {
  return (
    <RailFact label={label}>
      <InlineField
        {...rest}
        label={label}
        field={field}
        context={rest.context ?? `Deal · ${label}`}
        value={value ?? ""}
        onSave={(next, expected) => saveDealFields(id, { [field]: next === "" ? null : next }, { [field]: expected })}
      />
    </RailFact>
  );
}

/** The asking price and the target offer: money that may be text ("low 400s"), kept as typed. */
export function DealPrice({ id, which, raw }: { id: string; which: "their" | "our"; raw: string | null }) {
  const asking = which === "their";
  const label = asking ? DEAL_FIELD_LABEL.theirPrice : DEAL_FIELD_LABEL.ourPrice;
  return (
    <DealFact
      id={id}
      field={asking ? "theirPriceRaw" : "ourPriceRaw"}
      label={label}
      kind="money"
      allowText
      value={raw}
      empty={asking ? "Add asking price" : "Add target offer"}
    />
  );
}

/** Units: a whole number of one or more, or nothing. */
export function DealUnits({ id, value }: { id: string; value: number | null }) {
  return (
    <RailFact label={DEAL_FIELD_LABEL.units}>
      <InlineField
        kind="integer"
        label={DEAL_FIELD_LABEL.units}
        field="units"
        context="Deal · Units"
        value={value == null ? "" : String(value)}
        empty="Add units"
        // A deal has at least one unit; the New deal form asks for a positive number too.
        check={(text) => (text !== "" && Number(text.replace(/,/g, "")) < 1 ? "Enter 1 or more." : null)}
        onSave={(next, expected) => saveDealFields(id, { units: next === "" ? null : Number(next.replace(/,/g, "")) }, { units: expected })}
      />
    </RailFact>
  );
}

/** The listing link: checked on blur, with a button that opens it. */
export function DealListingLink({ id, value }: { id: string; value: string | null }) {
  return (
    <DealFact
      id={id}
      field="sourceUrl"
      label={DEAL_FIELD_LABEL.sourceUrl}
      kind="url"
      value={value}
      empty="Add listing URL"
      trailing={
        value ? (
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
        ) : undefined
      }
    />
  );
}

/** The pass reason, from the twelve reasons, with a named "No reason". Shown by the page only at Pass. */
export function DealPassReason({ id, value }: { id: string; value: string | null }) {
  const options = [...new Set([value, ...DEAL_PASS_REASONS].filter((r): r is string => !!r))].map((r) => ({ id: r, label: r }));
  return (
    <DealFact
      id={id}
      field="passReason"
      label={DEAL_FIELD_LABEL.passReason}
      kind="choice"
      value={value}
      empty="Pick a reason"
      options={options}
      emptyLabel="No reason"
    />
  );
}

/**
 * The stage, as the menu every stage uses: its ring, its word and a chevron.
 * A pick shows at once and toasts with Undo; a refusal (someone moved it
 * first) says who and when in the toast, and the old stage stays.
 */
export function DealStageRow({ id, status }: { id: string; status: string }) {
  const { run } = useRun();
  const [shown, setShown] = useOptimistic(status);

  function change(to: string) {
    if (to === status) return;
    run(() => saveDealFields(id, { status: to }, { status }), {
      before: () => setShown(to),
      done: `${DEAL_FIELD_LABEL.status} set to ${dealStageLabel(to)}`,
      key: `deal:${id}:stage`,
      undo: () => saveDealFields(id, { status }, { status: to }),
    });
  }

  return (
    <RailFact label={DEAL_FIELD_LABEL.status}>
      {/* Pulled out by the ghost button's 10px padding, so the ring lines up with the values under it. */}
      <StatusMenu kind="stage" value={shown} onChange={change} className="-ml-2.5" />
    </RailFact>
  );
}
