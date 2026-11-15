"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { InlineField } from "@/components/inline-field";
import { Money } from "@/components/money";
import { RailVerb } from "@/components/rail";
import { buttonClass } from "@/components/ui";
import { mailtoHref } from "@/lib/contacts";
import { fmtDay, type Ymd } from "@/lib/dates";
import { tenantShare } from "@/lib/tenants/fields";
import type { LeaseStatus } from "@/lib/tenants/status";
import { cn } from "@/lib/utils";
import { saveLease, saveLeaseTerm } from "./actions";
import { useTermSheet } from "./term-sheet";

export type FactValues = {
  leaseId: string;
  status: LeaseStatus;
  /** "647 Prospect · Front", for the sheets' second line. */
  home: string;
  /** The tenants' full names, primary first, for "Dana Lee and Sam Lee move out Jan 31". */
  names: string[];
  property: { id: string; label: string };
  unitLabel: string | null;
  movesIn: Ymd | null;
  movesOut: Ymd | null;
  deposit: string;
  /** The term that sets the rent today, or null before the first one is entered. */
  term: {
    id: string;
    rent: string;
    subsidy: string;
    /** Who pays the share and their contact (the Section 8 caseworker); shown only with a share. */
    subsidyFrom: string;
    subsidyContact: string;
    subsidyEmail: string;
    endsOn: Ymd | null;
  } | null;
};

/** "Dana Lee", "Dana Lee and Sam Lee", "Dana Lee and 2 others": short enough for a toast. */
function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]} and ${names.length - 1} others`;
}

/**
 * The lease's facts: a sticky rail of label and value rows from lg, a row of
 * chips under the title below it, scrolling sideways on a phone. One set of
 * controls; CSS moves them (the task page's Details). Each value saves at once
 * with a toast and Undo. Rent, the housing authority's share and Term ends
 * edit the term that's in force today.
 */
export function LeaseFacts(v: FactValues) {
  const { open } = useTermSheet();
  const ctx = `Lease · ${v.home}`;
  const rent = v.term ? Number(v.term.rent) : null;
  const share = v.term?.subsidy ? Number(v.term.subsidy) : null;
  const addTerm = <RailVerb onClick={open}>Add the signed lease</RailVerb>;

  return (
    <div
      className={cn(
        // Below lg: one row of chips. The vertical padding keeps the 44px touch area inside the scroller.
        "-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]! md:-mx-6 md:px-6 [&::-webkit-scrollbar]:hidden",
        "lg:mx-0 lg:block lg:overflow-visible lg:p-0",
      )}
    >
      <Row label="Property">
        <Link
          href={`/properties/${v.property.id}`}
          className="block truncate text-body text-foreground underline decoration-1 underline-offset-3 hover:decoration-2"
        >
          {v.property.label}
        </Link>
      </Row>
      {v.unitLabel && (
        <Row label="Unit">
          <span className="block truncate text-body text-foreground">{v.unitLabel}</span>
        </Row>
      )}
      <Row label={v.status === "upcoming" ? "Moves in" : "Moved in"}>
        <InlineField
          kind="date"
          label={v.status === "upcoming" ? "Moves in" : "Moved in"}
          field="movesIn"
          context={ctx}
          value={v.movesIn ?? ""}
          empty="Add move-in date"
          onSave={(next) => saveLease(v.leaseId, { movesIn: next || null })}
        />
      </Row>
      <Row label="Moves out">
        <InlineField
          kind="date"
          label="Moves out"
          field="movesOut"
          context={ctx}
          value={v.movesOut ?? ""}
          empty="Add move-out date"
          helper="Leave blank until they give notice"
          message={(next) =>
            !next
              ? "Move-out date cleared"
              : v.status === "past"
                ? `Moves out set to ${fmtDay(next)}`
                : `${nameList(v.names)} ${v.names.length === 1 ? "moves" : "move"} out ${fmtDay(next, { year: "auto" })}`
          }
          onSave={(next) => saveLease(v.leaseId, { movesOut: next || null })}
        />
      </Row>
      <Row label="Rent">
        {v.term ? (
          <InlineField
            kind="money"
            label="Rent"
            field="rent"
            context={ctx}
            value={v.term.rent}
            onSave={(next) => saveLeaseTerm(v.leaseId, v.term!.id, { rent: next })}
          />
        ) : (
          addTerm
        )}
      </Row>
      {/* Only with a housing authority share: without one it would repeat the rent. */}
      {rent !== null && share !== null && (
        <Row label="Tenant pays">
          <Money value={tenantShare(rent, share)} />
        </Row>
      )}
      <Row label="Housing authority">
        {v.term ? (
          <InlineField
            kind="money"
            label="Housing authority"
            field="subsidy"
            context={ctx}
            value={v.term.subsidy}
            empty="Add amount"
            message={(next) => (next ? "Housing authority share saved" : "Housing authority share cleared")}
            onSave={(next) => saveLeaseTerm(v.leaseId, v.term!.id, { subsidy: next })}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Row>
      {v.term && share !== null && (
        <>
          <Row label="Who pays">
            <InlineField
              kind="text"
              label="Who pays"
              field="subsidyFrom"
              context={ctx}
              value={v.term.subsidyFrom}
              empty="Add who pays"
              onSave={(next) => saveLeaseTerm(v.leaseId, v.term!.id, { subsidyFrom: next || null })}
            />
          </Row>
          <Row label="Contact">
            <InlineField
              kind="text"
              label="Contact"
              field="subsidyContact"
              context={ctx}
              value={v.term.subsidyContact}
              empty="Add contact"
              onSave={(next) => saveLeaseTerm(v.leaseId, v.term!.id, { subsidyContact: next || null })}
            />
          </Row>
          <Row label="Contact email">
            <InlineField
              kind="email"
              label="Contact email"
              field="subsidyEmail"
              context={ctx}
              value={v.term.subsidyEmail}
              empty="Add email"
              trailing={
                mailtoHref(v.term.subsidyEmail) && (
                  <a
                    href={mailtoHref(v.term.subsidyEmail)!}
                    aria-label={`Email ${v.term.subsidyContact || "the housing authority"}`}
                    title="Write"
                    className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-muted-foreground")}
                  >
                    <Mail aria-hidden="true" className="size-4" />
                  </a>
                )
              }
              onSave={(next) => saveLeaseTerm(v.leaseId, v.term!.id, { subsidyEmail: next || null })}
            />
          </Row>
        </>
      )}
      <Row label="Deposit">
        <InlineField
          kind="money"
          label="Deposit"
          field="deposit"
          context={ctx}
          value={v.deposit}
          empty="Add deposit"
          onSave={(next) => saveLease(v.leaseId, { deposit: next || null })}
        />
      </Row>
      <Row label="Term ends">
        {v.term ? (
          <InlineField
            kind="date"
            label="Term ends"
            field="endsOn"
            context={ctx}
            value={v.term.endsOn ?? ""}
            empty="Add end date"
            helper="Leave blank for month to month"
            message={(next) => (next ? `Term ends ${fmtDay(next, { year: "auto" })}` : "Term is month to month")}
            onSave={(next) => saveLeaseTerm(v.leaseId, v.term!.id, { endsOn: next || null })}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Row>
    </div>
  );
}

/**
 * One fact: in the rail, a 112px label in --muted-foreground and the value over a
 * hairline, 40px rows (48 on touch); below lg a chip that carries its own
 * label, since the rail's label column is gone.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center lg:min-h-10 lg:gap-3 lg:border-b lg:border-border lg:last:border-0 lg:pointer-coarse:min-h-12",
        "max-lg:h-8 max-lg:gap-1.5 max-lg:rounded-md max-lg:border max-lg:border-border max-lg:px-2.5 max-lg:text-meta pointer-coarse:max-lg:h-11",
      )}
    >
      <span className="shrink-0 text-meta text-muted-foreground lg:w-28">{label}</span>
      {/* The value's type, as RailFact sets it, so a plain value, a verb and an InlineField read the same size. */}
      <div className="min-w-0 text-foreground lg:flex-1 lg:text-body max-lg:whitespace-nowrap">{children}</div>
    </div>
  );
}
