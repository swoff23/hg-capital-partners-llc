import type { Prisma, PrismaClient } from "@prisma/client";
import { toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { parseUnits, type PropertyUnit } from "@/lib/property-types";
import { accessState, tenantUnit, type AccessState } from "@/lib/tasks/lockbox";
import { livingLease, nextLease } from "./status";

/**
 * Who lives in a task's home, for staff (docs/specs/tenants.md section 8): the
 * task page's Tenants row and Permission to enter switch, New task's switch,
 * and the task service's check before it saves permission. Staff only; the
 * portal reads the same through src/lib/portal/access-code.ts readJobAccess,
 * and both decide through lockbox.ts accessState.
 */

export type HomeTenant = { id: string; name: string; phone: string | null; dial: string | null };
export type HomeStay = { leaseId: string; movesIn: Ymd | null; movesOut: Ymd | null; tenants: HomeTenant[] };

export type TaskHome = {
  units: PropertyUnit[];
  /** The household living there today, or null when it's vacant or no unit names one. */
  living: HomeStay | null;
  /** With nobody living there: the household moving in next, for the Tenants row. */
  next: HomeStay | null;
  access: AccessState;
};

type Reader = Pick<PrismaClient, "property" | "lease"> | Pick<Prisma.TransactionClient, "property" | "lease">;

const stayOf = (l: {
  id: string;
  movesIn: Date | null;
  movesOut: Date | null;
  tenants: { tenant: { id: string; fullName: string; phone: string | null; phoneE164: string | null } }[];
}): HomeStay => ({
  leaseId: l.id,
  movesIn: toYmd(l.movesIn),
  movesOut: toYmd(l.movesOut),
  tenants: l.tenants.map(({ tenant: t }) => ({ id: t.id, name: t.fullName, phone: t.phone, dial: t.phoneE164 ?? t.phone })),
});

/** The task's home as it stands today, or null with no property. */
export async function readTaskHome(
  db: Reader,
  task: { propertyId: string | null; unitLabel: string | null; entryPermittedAt: Date | null },
  now: Date = new Date(),
): Promise<TaskHome | null> {
  if (!task.propertyId) return null;
  const row = await db.property.findUnique({ where: { id: task.propertyId }, select: { units: true } });
  if (!row) return null;
  const units = parseUnits(row.units);
  const home = tenantUnit(units, task.unitLabel);
  const leases = home
    ? await db.lease.findMany({
        where: { propertyId: task.propertyId, unitId: home.unitId },
        select: {
          id: true,
          unitId: true,
          movesIn: true,
          movesOut: true,
          tenants: {
            select: { tenant: { select: { id: true, fullName: true, phone: true, phoneE164: true } } },
            orderBy: [{ primary: "desc" }, { position: "asc" }],
          },
        },
      })
    : [];
  const today = todayYmdEastern(now);
  const living = home ? livingLease(leases, home.unitId, today) : null;
  const next = home && !living ? nextLease(leases, home.unitId, today) : null;
  return {
    units,
    living: living ? stayOf(living) : null,
    next: next ? stayOf(next) : null,
    access: accessState(units, task.unitLabel, living, task.entryPermittedAt),
  };
}

/** Whether a household lives in this home today: when Permission to enter means something. */
export async function homeOccupied(db: Reader, propertyId: string | null, unitLabel: string | null, now: Date = new Date()): Promise<boolean> {
  return !!(await readTaskHome(db, { propertyId, unitLabel, entryPermittedAt: null }, now))?.living;
}
