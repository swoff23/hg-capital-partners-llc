"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormSheet } from "@/components/form-sheet";
import { Meter } from "@/components/meter";
import { Money } from "@/components/money";
import { NumberInput, numberHelper, numberProblem } from "@/components/number-input";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FormField, Input, Table, Td, Th, addRowClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { stableJson } from "@/lib/drafts";
import { cn, fmtMoney } from "@/lib/utils";
import {
  lifecycleStatus,
  parseCapexCost,
  parseInstallYear,
  projectedYear,
  systemsDated,
  type BuildingCapexData,
  type BuildingRule,
  type CapexRules,
} from "@/lib/property-types";
import { dueIn } from "@/lib/properties/capex";
import { updateBuildingCapex } from "../actions";
import { LoadLatest } from "@/components/load-latest";
import { EquipmentStatusText, fmtAge } from "../capex-ui";

const NOW = new Date().getFullYear();

/** What a system's sheet edits: its type, the year it was installed and a cost that replaces the default. All text, as typed. */
type Draft = { type: string; year: string; cost: string };

const toDraft = (data: BuildingCapexData, key: string): Draft => ({
  type: data[key]?.type ?? "",
  year: data[key]?.year ?? "",
  cost: data[key]?.costOverride != null ? String(data[key]!.costOverride) : "",
});

/**
 * The building's major systems (forms 4.2): roof, windows, electrical and the
 * rest, read as rows. A row opens a small sheet for that one system: its
 * type, the year it went in and a cost when it isn't the default, saved with
 * the version the sheet opened at, so a change anyone else made to the
 * property meanwhile refuses it. The count of systems with a year, with a
 * 64px meter, says how complete the dates are (charts 4.2), and a Monitor or
 * Replace cost says the year it falls due ("$8,000 in 2032"), so a cost past
 * the forecast reads as later, not missing.
 *
 * It sits folded at the foot of the CapEx section (docs/specs/property-page.md
 * 2.3): one "Building systems" row with the count and the meter, which opens
 * the table in place. It starts closed on every visit; an open sheet keeps it
 * open, so a save never folds the row it came from.
 */
export function BuildingSystems({
  propertyId,
  version,
  initial,
  rules,
}: {
  propertyId: string;
  /** Property.updatedAt the page rendered with; a sheet pins it when it opens, and the save refuses a newer row. */
  version: string;
  initial: BuildingCapexData;
  rules: CapexRules;
}) {
  const items = rules.building;
  // The system whose sheet is up, and the version it opened at: a save in another card refreshes the page
  // with a newer one, and sending that would let this draft overwrite a partner's change. A new `id` per open
  // gives the sheet fresh fields; it stays mounted while it closes, so it slides out.
  const [sheet, setSheet] = useState<{ key: string; version: string; id: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const { dated, total } = systemsDated(initial, rules);
  const current = items.find((i) => i.key === sheet?.key) ?? null;

  const phoneHidden = "max-[480px]:hidden";
  // Below 360 the Status column drops and each row's status sits under its component, as Portfolio's does below sm,
  // so Component, Year and Cost fit a 320 screen with a cost on the row.
  // (Tailwind's max-[360px] is a width under 360, and min-[360px] one of 360 and over.)
  const narrowHidden = "max-[360px]:hidden";
  // Type also drops where the record's main column is narrowest (536px at 1024, beside the rail).
  const typeHidden = "max-[480px]:hidden lg:max-xl:hidden";

  function openSheet(key: string) {
    setSheet({ key, version, id: (sheet?.id ?? 0) + 1 });
    setIsOpen(true);
  }

  /** Row state from what's stored. */
  const rowFor = (item: BuildingRule) => {
    const src = initial[item.key];
    const installY = parseInstallYear(src?.year);
    const age = installY == null ? null : Math.max(0, NOW - installY);
    const cost = src?.costOverride ?? item.defaultCost;
    return {
      age,
      status: lifecycleStatus(age, item.monitor, item.replace),
      cost,
      overridden: src?.costOverride != null && src.costOverride !== item.defaultCost,
      // "in 2032" while it's ahead; a year already past says nothing, the Replace status does.
      due: dueIn(projectedYear({ kind: "building", key: item.key, year: src?.year }, rules), NOW),
    };
  };

  return (
    <div>
      {/* The foot row's look (AddRow), with the count and its meter at the right; the meter is a picture of the words,
          so it drops under 360 to keep the row on one line. */}
      <button type="button" aria-expanded={shown} onClick={() => setShown((v) => !v)} className={cn(addRowClass, "justify-between")}>
        <span className="flex items-center gap-2 whitespace-nowrap">
          {shown ? (
            <ChevronUp aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          Building systems
        </span>
        <span className="num flex items-center gap-2 whitespace-nowrap text-meta font-normal text-muted-foreground">
          <Meter value={dated} max={total} className="w-16 max-[360px]:hidden" />
          <span>
            {dated} of {total} dated
          </span>
        </span>
      </button>

      {shown && (
      /* Reading on a phone, the type and age drop so the cost stays on screen, and below 360 the status moves under the name. */
      <Table>
        <thead>
          <tr>
            <Th className="pl-0">Component</Th>
            <Th className={typeHidden}>Type</Th>
            <Th>Year</Th>
            <Th className={phoneHidden}>Age</Th>
            <Th className={narrowHidden}>Status</Th>
            <Th numeric className="pr-0">
              Cost
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => {
            const stored = initial[item.key];
            const rs = rowFor(item);
            const showCost = rs.status === "Monitor" || rs.status === "Replace";
            return (
              <tr key={item.key} onClick={() => openSheet(item.key)} className="transition-colors pointer-fine:cursor-pointer pointer-fine:hover:bg-muted">
                <Td className="pl-0 align-middle text-foreground min-[480px]:whitespace-nowrap">
                  {/* The row opens it with a click; this is the keyboard's way in, and names what it opens. */}
                  <button type="button" aria-label={`Edit ${item.label}`} className="text-left">
                    {item.label}
                  </button>
                  {/* The status column's word, from where it is dropped (below 360). */}
                  {rs.status && (
                    <span className="mt-0.5 block text-meta min-[360px]:hidden">
                      <EquipmentStatusText status={rs.status} />
                    </span>
                  )}
                </Td>
                <Td className={cn("align-middle", typeHidden)}>
                  {stored?.type ? <span className="text-fg-2">{stored.type}</span> : <span className="text-muted-foreground">—</span>}
                </Td>
                <Td className="num align-middle">{stored?.year || <span className="text-muted-foreground">—</span>}</Td>
                <Td className={cn("num whitespace-nowrap align-middle text-fg-2", phoneHidden)}>{fmtAge(rs.age)}</Td>
                <Td className={cn("whitespace-nowrap align-middle", narrowHidden)}>
                  <EquipmentStatusText status={rs.status} />
                </Td>
                <Td numeric className="pr-0 align-middle">
                  {showCost ? (
                    <>
                      <span className="whitespace-nowrap">
                        <Money value={rs.cost} />
                        {rs.due && <span className="text-meta text-muted-foreground max-[480px]:hidden"> {rs.due}</span>}
                      </span>
                      {/* An overridden cost says what it replaced, where the bare "*" used to. */}
                      {rs.overridden && <span className="block text-meta text-muted-foreground">Default {fmtMoney(item.defaultCost)}</span>}
                    </>
                  ) : (
                    // Nothing to spend yet (Good or Unknown): the empty-cell dash, so the column never reads unfinished.
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      )}

      {sheet && current && (
        <SystemSheet
          key={sheet.id}
          propertyId={propertyId}
          version={sheet.version}
          latest={version}
          item={current}
          initial={toDraft(initial, current.key)}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
        />
      )}
    </div>
  );
}

/**
 * One system's sheet: Type, Year and Cost. Save is the one write, and it
 * names what happened. Refused because the property moved on, the page
 * behind comes back on the latest and "Load the latest" starts the sheet
 * over on it, as the unit sheet does.
 */
function SystemSheet({
  propertyId,
  version,
  latest,
  item,
  initial,
  isOpen,
  onOpenChange,
}: {
  propertyId: string;
  version: string;
  /** The page's version now, which "Load the latest" pins. */
  latest: string;
  item: BuildingRule;
  initial: Draft;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [base, setBase] = useState<Draft>(initial);
  const [pinned, setPinned] = useState(version);
  const [draft, setDraft] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const run = useRun();
  const router = useRouter();

  function loadLatest() {
    run.reset();
    setTried(false);
    setBase(initial);
    setDraft(initial);
    setPinned(latest);
    router.refresh();
  }

  const yearProblem = draft.year.trim() === "" ? null : numberProblem("year", draft.year);
  const costProblem = numberProblem("money", draft.cost);
  const problems = { year: yearProblem, cost: costProblem };

  function submit() {
    setTried(true);
    if (yearProblem || costProblem) return;
    run.run(
      () =>
        updateBuildingCapex(
          propertyId,
          {
            [item.key]: {
              type: draft.type.trim() || null,
              year: draft.year.trim() || null,
              costOverride: parseCapexCost(draft.cost),
            },
          },
          pinned,
        ),
      { failure: "inline", succeeded: () => onOpenChange(false), done: `${item.label} saved`, key: `capex:${propertyId}:${item.key}` },
    );
  }

  const set = (field: keyof Draft) => (value: string) => {
    run.reset();
    setDraft((d) => ({ ...d, [field]: value }));
  };
  const serverYear = run.fieldErrors?.[`${item.key}.year`];

  return (
    <FormSheet
      title={item.label}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary="Save"
      pending={run.pending}
      values={draft}
      dirty={stableJson(draft) !== stableJson(base)}
      discardTitle={`Discard changes to ${item.label}?`}
      leaveTitle={`Leave ${item.label}?`}
      error={run.error && !serverYear ? run.error : undefined}
      errorAction={run.conflict && <LoadLatest onClick={loadLatest} />}
      fieldErrors={run.fieldErrors}
    >
      <FormField label="Type" optional helper="Shingle, vinyl, copper">
        {(p) => <Input {...p} value={draft.type} autoComplete="off" onChange={(e) => set("type")(e.target.value)} />}
      </FormField>
      <FormField
        label="Year installed"
        optional
        helper="Adds this system to the forecast"
        error={(tried && problems.year) || serverYear || undefined}
      >
        {(p) => <NumberInput kind="year" {...p} value={draft.year} onChange={set("year")} />}
      </FormField>
      <FormField
        label="Cost"
        optional
        helper={numberHelper("money", draft.cost, { fallback: `Default ${fmtMoney(item.defaultCost)}` })}
        error={(tried && problems.cost) || undefined}
      >
        {(p) => <NumberInput kind="money" {...p} value={draft.cost} onChange={set("cost")} />}
      </FormField>
    </FormSheet>
  );
}
