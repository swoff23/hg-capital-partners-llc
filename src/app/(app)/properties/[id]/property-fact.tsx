"use client";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { InlineField, InlineSwitch, type InlineFieldProps } from "@/components/inline-field";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { RailFact } from "@/components/rail";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fmtDay, isPastDay, relativeDays } from "@/lib/dates";
import { patchProperty } from "../actions";
import { onPropertyFieldRequest, openPropertyField } from "./edit-field-event";

/**
 * One fact in a property's rail, edited in place (forms 4.2, 3.1 A): the
 * rail's row, an `InlineField`, and the save through `patchProperty`. It
 * sends the one field it changed with the value it loaded, so a partner's
 * newer change to that field refuses the save and names them.
 *
 *   <PropertyFact id={p.id} field="loanRate" label="Rate" kind="percent" value={p.loanRate} empty="Add rate" context="Loan · 767 Prospect Ave" />
 *
 * `label` is the rail's (short, so it fits 96px on a phone); `name` the full
 * name for the sheet's title and the toast ("Registration expiry").
 * Other facts' verbs outside the section (the fact strip's "Add value") open
 * the field through `openPropertyField`.
 */
type FactProps = Omit<InlineFieldProps, "label" | "value" | "onSave" | "kind" | "onRequest"> & {
  id: string;
  /** The property column ("loanRate"). */
  field: string;
  label: string;
  /** The full name, when the rail's label is a shortened one. */
  name?: string;
  /** An anchor on the row ("value"), for a link elsewhere on the page. */
  anchor?: string;
  kind: InlineFieldProps["kind"];
  value: string | null | undefined;
};

export function PropertyFact({ id, field, label, name, anchor, value, ...rest }: FactProps) {
  return (
    <RailFact label={label} id={anchor}>
      <InlineField
        {...rest}
        label={name ?? label}
        field={field}
        value={value ?? ""}
        onSave={(next, expected) => patchProperty(id, { [field]: next }, { [field]: expected })}
        onRequest={(open) => onPropertyFieldRequest([field], open)}
      />
    </RailFact>
  );
}

/** The escrow yes or no, as a switch in the rail's row (selectors 3.10). */
export function PropertyEscrow({ id, escrow }: { id: string; escrow: boolean }) {
  return (
    <RailFact label="Escrow">
      <InlineSwitch
        label="Escrow"
        field="loanEscrow"
        value={escrow ? "yes" : "no"}
        onSave={(next, expected) => patchProperty(id, { loanEscrow: next }, { loanEscrow: expected })}
      />
    </RailFact>
  );
}

/**
 * A key date: loan maturity, insurance renewal, tax due, registration expiry.
 * Shown even when it's missing, since its reminder task only exists once the
 * date is set (JOURNEYS-006): an empty one is a --warn verb. A past date reads
 * late in --danger, and the days away ride beside it until the row is too
 * narrow for them. The helper says what the date does ("Adds a reminder 60
 * days before"), and the toast says it did.
 */
export function PropertyKeyDate({
  id,
  field,
  label,
  name,
  date,
  addLabel,
  leadDays,
  context,
}: {
  id: string;
  field: string;
  label: string;
  name?: string;
  date: string | null;
  /** The verb when it's missing: "Add maturity date". */
  addLabel: string;
  /** How many days before it the reminder task falls due (lib/properties/service.ts). */
  leadDays: number;
  context: string;
}) {
  return (
    <PropertyFact
      id={id}
      field={field}
      label={label}
      name={name}
      kind="date"
      value={date}
      empty={addLabel}
      tone="warn"
      context={context}
      helper={`Adds a reminder ${leadDays} days before`}
      ripple={(next) => (next ? "Reminder task added" : "Reminder task removed")}
      display={(text) => <KeyDateText date={text} />}
    />
  );
}

function KeyDateText({ date }: { date: string }) {
  const late = isPastDay(date);
  return (
    <span className="flex min-w-0 items-baseline gap-x-2">
      <span className={cn("num shrink-0", late && "text-danger")}>{fmtDay(date)}</span>
      {/* Drops when the row is too narrow, rather than wrapping. */}
      <span className={cn("truncate text-meta max-[26rem]:hidden", late ? "text-danger" : "text-fg-3")}>{relativeDays(date)}</span>
    </span>
  );
}

/**
 * The section's ⋯ menu for a code (forms 3.2 A). A code copies on one tap, so
 * tapping it can't also edit it; the change sits here, out of the way, and
 * opens the same field the other facts use.
 */
export function ChangeCodeMenu({ title, field, change }: { title: string; field: string; change: string }): ReactNode {
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`${title} actions`}
        className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "-mr-2 text-fg-3 data-pressed:bg-fill-1")}
      >
        <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="size-4" />
      </AriaButton>
      <Menu sheetTitle={title}>
        <MenuItem onAction={() => openPropertyField(field)}>{change}</MenuItem>
      </Menu>
    </MenuTrigger>
  );
}
