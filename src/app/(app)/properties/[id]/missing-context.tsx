"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { GapSection } from "@/lib/missing/checks";

/**
 * A property page's required blanks (docs/specs/missing-info.md, D2), so each
 * section can mark its own in place: a fact's empty verb in --warn, the
 * row kept out of its rail's fold, and "· 3 missing" beside the section's
 * title. The page fills it from the Missing info checks; with no provider
 * nothing is marked.
 */
type Missing = {
  fields: ReadonlySet<string>;
  sections: Partial<Record<GapSection, number>>;
  /** Required blanks per unit, by its id. */
  units: Readonly<Record<string, number>>;
};

const EMPTY: Missing = { fields: new Set(), sections: {}, units: {} };
const MissingContext = createContext<Missing>(EMPTY);

export function PropertyMissingProvider({
  fields,
  sections,
  units,
  children,
}: {
  fields: string[];
  sections: Partial<Record<GapSection, number>>;
  units: Record<string, number>;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ fields: new Set(fields), sections, units }), [fields, sections, units]);
  return <MissingContext value={value}>{children}</MissingContext>;
}

/** The property fields that are a required blank. */
export function useMissingFields(): ReadonlySet<string> {
  return useContext(MissingContext).fields;
}

/** Whether this property field is a required blank. */
export function useMissingField(field: string): boolean {
  return useContext(MissingContext).fields.has(field);
}

/** How many required blanks a unit has. */
export function useUnitMissing(unitId: string | null | undefined): number {
  const units = useContext(MissingContext).units;
  return unitId ? (units[unitId] ?? 0) : 0;
}

/** A section's title with its required blanks beside it: "Insurance · 3 missing". */
export function MissingTitle({ section, children }: { section: GapSection; children: ReactNode }) {
  const n = useContext(MissingContext).sections[section] ?? 0;
  return (
    <>
      {children}
      {n > 0 && <span className="text-meta font-normal text-warn"> · {n} missing</span>}
    </>
  );
}
