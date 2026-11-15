import "server-only";
import { prisma } from "@/lib/db";
import { toYmd, type Ymd } from "@/lib/dates";
import { compareStreet, shortAddress } from "@/lib/normalize";
import { parseUnits } from "@/lib/property-types";
import { rentableUnits } from "./core";
import { homeLabel, leaseEndsLabel, leaseStatus, livingLease, nextLease, termToday, type LeaseStatus } from "./status";

export { homeLabel };

/**
 * What the tenant pages read (docs/specs/tenants.md sections 4 to 6). Staff
 * only: nothing under src/app/(portal) or src/lib/portal imports this file.
 * The data is small (a few dozen units, their leases over the years), so the
 * list reads every lease once and filters in memory, as Contractors does.
 */

const leaseInclude = {
  property: { select: { id: true, address: true, units: true, archivedAt: true } },
  tenants: { include: { tenant: true }, orderBy: [{ primary: "desc" as const }, { position: "asc" as const }] },
  terms: { orderBy: { startsOn: "desc" as const }, include: { file: { select: { id: true, filename: true } } } },
};

export type TenantView = "current" | "past" | "all";

export type TenantRow = {
  tenantId: string;
  leaseId: string;
  fullName: string;
  phone: string | null;
  primary: boolean;
  propertyId: string;
  address: string;
  home: string;
  /** The whole monthly rent, on the primary's row only. */
  rent: number | null;
  leaseEnds: string;
  status: LeaseStatus;
  /** For the Home sort: street order, then the unit's place in the property. */
  unitOrder: number;
  /** For the Lease ends sort: the day, "" when there's none. */
  endsOn: Ymd | "";
};

/**
 * One row per person per lease. Current holds current and upcoming leases (the
 * households HG Capital has now or has signed); Past holds those who moved
 * out. A search matches the name, phone, email, address and unit.
 */
export async function tenantRows(opts: { view: TenantView; propertyIds?: readonly string[]; q?: string }, today: Ymd): Promise<TenantRow[]> {
  const leases = await prisma.lease.findMany({
    where: opts.propertyIds?.length ? { propertyId: { in: [...opts.propertyIds] } } : {},
    include: leaseInclude,
  });
  const words = (opts.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const rows: TenantRow[] = [];
  for (const l of leases) {
    const status = leaseStatus(l, today);
    if (opts.view === "current" && status === "past") continue;
    if (opts.view === "past" && status !== "past") continue;
    const units = parseUnits(l.property.units);
    const unitOrder = Math.max(0, units.findIndex((u) => u.id === l.unitId));
    const now = termToday(l.terms, today);
    const ends = leaseEndsLabel(l, l.terms, today);
    for (const t of l.tenants) {
      const hay = [t.tenant.fullName, t.tenant.phone, t.tenant.email, l.property.address, l.unitLabel].join(" ").toLowerCase();
      if (words.some((w) => !hay.includes(w))) continue;
      rows.push({
        tenantId: t.tenantId,
        leaseId: l.id,
        fullName: t.tenant.fullName,
        phone: t.tenant.phone,
        primary: t.primary,
        propertyId: l.propertyId,
        address: l.property.address,
        home: homeLabel(l.property.address, l.unitLabel),
        rent: t.primary && now ? Number(now.term.rent) : null,
        leaseEnds: ends,
        status,
        unitOrder,
        endsOn: (status === "past" ? toYmd(l.movesOut) : toYmd(now?.term.endsOn)) ?? "",
      });
    }
  }
  // Within a unit: who lives there now, then who's moving in, then who's gone.
  const statusRank: Record<LeaseStatus, number> = { current: 0, upcoming: 1, past: 2 };
  return rows.sort(
    (a, b) =>
      compareStreet(a.address, b.address) ||
      a.unitOrder - b.unitOrder ||
      statusRank[a.status] - statusRank[b.status] ||
      Number(b.primary) - Number(a.primary) ||
      a.fullName.localeCompare(b.fullName),
  );
}

/** The Property facet's options: properties that have a lease, in street order. */
export async function tenantPropertyOptions(): Promise<{ id: string; label: string }[]> {
  const props = await prisma.property.findMany({ where: { leases: { some: {} } }, select: { id: true, address: true } });
  return props.sort((a, b) => compareStreet(a.address, b.address)).map((p) => ({ id: p.id, label: shortAddress(p.address) }));
}

/** Everything the lease page shows, or null when the lease is gone. */
export async function leasePage(id: string, today: Ymd) {
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: { ...leaseInclude, files: { orderBy: { createdAt: "desc" } } },
  });
  if (!lease) return null;
  const others = await prisma.lease.findMany({
    where: { propertyId: lease.propertyId, unitId: lease.unitId, id: { not: id } },
    include: { tenants: { include: { tenant: { select: { fullName: true } } }, orderBy: [{ primary: "desc" }, { position: "asc" }] }, terms: { orderBy: { startsOn: "desc" } } },
    orderBy: { movesIn: "desc" },
  });
  return {
    lease,
    status: leaseStatus(lease, today),
    home: homeLabel(lease.property.address, lease.unitLabel),
    now: termToday(lease.terms, today),
    others: others.map((o) => ({
      id: o.id,
      names: o.tenants.map((t) => t.tenant.fullName),
      status: leaseStatus(o, today),
      movesIn: toYmd(o.movesIn),
      movesOut: toYmd(o.movesOut),
      rent: o.terms[0] ? Number(o.terms[0].rent) : null,
    })),
  };
}

export type PropertyTenantUnit = {
  unitId: string | null;
  label: string;
  living: { leaseId: string; names: string[]; rent: number | null; leaseEnds: string } | null;
  next: { leaseId: string; names: string[]; movesIn: Ymd | null } | null;
};

/**
 * A property's Tenants section: one row per rentable unit in the units' order
 * (a property with no units gets one row, "Home"), with who lives there and
 * who's next; then the past leases, newest first.
 */
export async function propertyTenants(propertyId: string, units: unknown, today: Ymd) {
  const leases = await prisma.lease.findMany({
    where: { propertyId },
    include: { tenants: { include: { tenant: { select: { fullName: true } } }, orderBy: [{ primary: "desc" }, { position: "asc" }] }, terms: { orderBy: { startsOn: "desc" } } },
  });
  const rentable = rentableUnits(parseUnits(units));
  const slots: { unitId: string | null; label: string }[] = rentable.length
    ? rentable.map((u, i) => ({ unitId: u.id ?? null, label: u.label?.trim() || `Unit ${i + 1}` }))
    : [{ unitId: null, label: "Home" }];
  const names = (l: (typeof leases)[number]) => l.tenants.map((t) => t.tenant.fullName);
  const rows: PropertyTenantUnit[] = slots.map((s) => {
    const living = livingLease(leases, s.unitId, today);
    const next = nextLease(leases, s.unitId, today);
    const now = living ? termToday(living.terms, today) : null;
    return {
      ...s,
      living: living ? { leaseId: living.id, names: names(living), rent: now ? Number(now.term.rent) : null, leaseEnds: leaseEndsLabel(living, living.terms, today) } : null,
      next: next ? { leaseId: next.id, names: names(next), movesIn: toYmd(next.movesIn) } : null,
    };
  });
  const past = leases
    .filter((l) => leaseStatus(l, today) === "past")
    .sort((a, b) => (toYmd(b.movesOut) ?? "").localeCompare(toYmd(a.movesOut) ?? ""))
    .map((l) => ({
      leaseId: l.id,
      names: names(l),
      unitLabel: l.unitLabel,
      movesIn: toYmd(l.movesIn),
      movesOut: toYmd(l.movesOut),
      rent: l.terms[0] ? Number(l.terms[0].rent) : null,
    }));
  return { units: rows, past };
}
