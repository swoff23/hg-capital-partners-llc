import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortAddress } from "@/lib/normalize";
import { isHouseMeterRow, parseUnits, withUnitIds } from "@/lib/property-types";
import type { DrawIn, LineIn } from "./figures";

/**
 * The reads behind Draws, a rehab's page, the property page's Rehab section
 * and Home (docs/specs/rehab-draws.md). Each returns plain numbers, never
 * Prisma Decimals, so the figures in ./figures.ts and the client components
 * take them as they are.
 */

export interface RehabProperty {
  id: string;
  address: string;
  loanMaturityDate: Date | null;
}

/** A unit a line can be for: one of the rehab's properties' units, less house-meter rows (R8). */
export interface UnitOption {
  /** "<propertyId>|<unitId>", what the picker sends back. */
  value: string;
  propertyId: string;
  /** The lasting id, or a "unit-at-<n>" placeholder until the unit gets one. */
  unitId: string;
  /** "Upper", or "765 Prospect Avenue · Upper" when the rehab covers more than one property. */
  label: string;
}

export interface RehabRecord {
  id: string;
  name: string;
  lender: string | null;
  holdback: number | null;
  notes: string | null;
  source: "APP" | "WORKSHEET";
  doneAt: Date | null;
  properties: RehabProperty[];
  /** The units a line can pick, by property then the property's own order. */
  units: UnitOption[];
  lines: LineIn[];
  /** Newest first. */
  draws: DrawIn[];
}

const include = {
  properties: { select: { property: { select: { id: true, address: true, loanMaturityDate: true, units: true } } } },
  lines: { orderBy: { position: "asc" } },
  draws: { orderBy: { number: "desc" }, include: { lines: { select: { lineId: true, amount: true } } } },
} satisfies Prisma.RehabInclude;

type Raw = Prisma.RehabGetPayload<{ include: typeof include }>;

const num = (d: Prisma.Decimal | null): number | null => (d == null ? null : Number(d.toString()));

function toRecord(r: Raw): RehabRecord {
  const props = r.properties.map((p) => p.property).sort((a, b) => a.address.localeCompare(b.address));
  const several = props.length > 1;
  const units: UnitOption[] = props.flatMap((p) =>
    withUnitIds(parseUnits(p.units))
      .filter((u) => !isHouseMeterRow(u) && u.id)
      .map((u) => {
        const label = u.label?.trim() || "Unit";
        return { value: `${p.id}|${u.id}`, propertyId: p.id, unitId: u.id!, label: several ? `${shortAddress(p.address) || p.address} · ${label}` : label };
      }),
  );
  // A line shows its unit's label today, so a renamed unit reads its new name; a worksheet's own unit keeps its words.
  const byId = new Map(units.map((u) => [u.unitId, u.label]));
  return {
    id: r.id,
    name: r.name,
    lender: r.lender,
    holdback: num(r.holdback),
    notes: r.notes,
    source: r.source,
    doneAt: r.doneAt,
    properties: props.map(({ id, address, loanMaturityDate }) => ({ id, address, loanMaturityDate })),
    units,
    lines: r.lines.map((l) => ({
      id: l.id,
      position: l.position,
      unitId: l.unitId,
      unitLabel: (l.unitId ? byId.get(l.unitId) : null) ?? l.unitLabel,
      name: l.name,
      original: num(l.original) ?? 0,
      changeOrder: num(l.changeOrder) ?? 0,
    })),
    draws: r.draws.map((d) => ({
      id: d.id,
      number: d.number,
      stage: d.stage,
      stageChangedAt: d.stageChangedAt,
      sentOn: d.sentOn,
      sentAmount: num(d.sentAmount),
      approvedOn: d.approvedOn,
      approvedAmount: num(d.approvedAmount),
      fundedOn: d.fundedOn,
      fundedAmount: num(d.fundedAmount),
      waitingOnUs: d.waitingOnUs,
      waitingNote: d.waitingNote,
      lines: d.lines.map((l) => ({ lineId: l.lineId, amount: num(l.amount) ?? 0 })),
    })),
  };
}

export async function getRehab(id: string): Promise<RehabRecord | null> {
  const r = await prisma.rehab.findUnique({ where: { id }, include });
  return r ? toRecord(r) : null;
}

/** Open rehabs (Draws' default view, Home), or done ones, by name. */
export async function listRehabs(view: "open" | "done"): Promise<RehabRecord[]> {
  const rows = await prisma.rehab.findMany({
    where: { doneAt: view === "open" ? null : { not: null } },
    include,
    orderBy: view === "open" ? { name: "asc" } : { doneAt: "desc" },
  });
  return rows.map(toRecord);
}

/** The open rehab a property is part of, for its Rehab section (L3). */
export async function rehabForProperty(propertyId: string): Promise<RehabRecord | null> {
  const r = await prisma.rehab.findFirst({ where: { doneAt: null, properties: { some: { propertyId } } }, include });
  return r ? toRecord(r) : null;
}

/** How many rehabs are done, for the Done segment's count. */
export async function doneCount(): Promise<number> {
  return prisma.rehab.count({ where: { doneAt: { not: null } } });
}

/** Properties a rehab can cover: every one not archived, by address. */
export async function rehabPropertyOptions(): Promise<{ id: string; address: string; status: string | null }[]> {
  return prisma.property.findMany({ where: { archivedAt: null }, select: { id: true, address: true, status: true }, orderBy: { address: "asc" } });
}
