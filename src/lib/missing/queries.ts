import "server-only";
import { prisma } from "@/lib/db";
import { easternDayStart, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { liveRecord } from "@/lib/record-scope";
import { openMakeTaskItemsWhere, workedSinceWhere } from "@/lib/tasks/list-query";
import { missingInfo, type CheckInput, type CheckProperty, type MissingInfo } from "./checks";
import { leaseEndItems, type LeaseEndInput } from "./lease-notice";
import type { NeedsYouItem } from "@/lib/home/needs-you";

/**
 * Everything the Missing info checks read (docs/specs/missing-info.md), in
 * one place: the live properties with their units, listings and leases, the
 * live contractors with their files and this year's work, and the skips. The
 * rules are in ./checks. `scope` narrows it to one record for its page.
 */

export type MissingScope = { propertyId?: string; contactId?: string };

const PROPERTY_SELECT = {
  id: true,
  address: true,
  status: true,
  currentLoan: true,
  lender: true,
  loanServicer: true,
  loanNumber: true,
  loanRate: true,
  loanPaymentMonthly: true,
  loanMaturityDate: true,
  insuranceCarrier: true,
  insurancePolicyNo: true,
  insuranceRenewalDate: true,
  insurancePremium: true,
  insuranceCoverage: true,
  propertyTaxDueDate: true,
  rentalRegistrationExpiry: true,
  units: true,
  listings: { select: { unitLabel: true, status: true } },
  leases: {
    select: {
      id: true,
      unitId: true,
      unitLabel: true,
      movesIn: true,
      movesOut: true,
      deposit: true,
      terms: { select: { id: true, startsOn: true, endsOn: true, fileId: true, subsidy: true, subsidyContact: true } },
      tenants: { select: { primary: true, tenant: { select: { id: true, fullName: true, phone: true, email: true } } }, orderBy: { position: "asc" } },
    },
  },
} as const;

/** The first instant of Buffalo's calendar year `today` falls in. */
const yearStart = (today: Ymd) => easternDayStart(`${today.slice(0, 4)}-01-01`);

/**
 * The contractors who worked this calendar year (D7): a job assigned to them
 * that's open now or was finished this year, or, with QuickBooks connected, a
 * payment this year to their vendor. A draft Claude saved for them is no job
 * yet (tasks/list-query.ts workedSinceWhere).
 */
async function workedThisYear(today: Ymd, contactIds?: string[]): Promise<Set<string>> {
  const since = yearStart(today);
  const [jobs, vendors] = await Promise.all([
    prisma.task.findMany({
      where: workedSinceWhere(since, contactIds),
      select: { assigneeContactId: true },
      distinct: ["assigneeContactId"],
    }),
    prisma.qboVendor.findMany({
      where: { contactId: contactIds ? { in: contactIds } : { not: null } },
      select: { qboId: true, realmId: true, contactId: true },
    }),
  ]);
  const out = new Set(jobs.flatMap((j) => (j.assigneeContactId ? [j.assigneeContactId] : [])));
  if (vendors.length > 0) {
    // A ledger line's txnDate is a calendar date; this year's lines start at its Jan 1.
    const paid = await prisma.ledgerLine.findMany({
      where: { txnDate: { gte: new Date(`${today.slice(0, 4)}-01-01T00:00:00Z`) }, vendorQboId: { in: vendors.map((v) => v.qboId) } },
      select: { vendorQboId: true, realmId: true },
      distinct: ["vendorQboId", "realmId"],
    });
    const paidKeys = new Set(paid.map((l) => `${l.realmId}:${l.vendorQboId}`));
    for (const v of vendors) if (v.contactId && paidKeys.has(`${v.realmId}:${v.qboId}`)) out.add(v.contactId);
  }
  return out;
}

/** What the checks read, for every live record or for the one in `scope`. */
export async function checkInput(today: Ymd, scope: MissingScope = {}): Promise<CheckInput> {
  const wantProperties = !scope.contactId;
  const wantContacts = !scope.propertyId;
  const [properties, contacts, skips] = await Promise.all([
    wantProperties
      ? prisma.property.findMany({ where: { ...liveRecord, ...(scope.propertyId ? { id: scope.propertyId } : {}) }, select: PROPERTY_SELECT })
      : [],
    wantContacts
      ? prisma.contact.findMany({
          where: { ...liveRecord, ...(scope.contactId ? { id: scope.contactId } : {}) },
          select: {
            id: true,
            fullName: true,
            active: true,
            needsReview: true,
            w9Url: true,
            coiUrl: true,
            noInsurance: true,
            email: true,
            phone: true,
            phoneE164: true,
            documents: { select: { kind: true }, distinct: ["kind"] },
          },
        })
      : [],
    prisma.missingInfoSkip.findMany({ select: { check: true, subject: true, createdAt: true, createdBy: { select: { name: true, email: true } } } }),
  ]);
  const worked = wantContacts ? await workedThisYear(today, scope.contactId ? [scope.contactId] : undefined) : new Set<string>();
  return {
    properties: properties as unknown as CheckProperty[],
    contacts: contacts.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      active: c.active,
      needsReview: c.needsReview,
      hasW9: !!c.w9Url || c.documents.some((d) => d.kind === "W9"),
      hasInsurance: !!c.coiUrl || c.noInsurance || c.documents.some((d) => d.kind === "INSURANCE"),
      email: c.email,
      phone: c.phone ?? c.phoneE164,
      worked: worked.has(c.id),
    })),
    skips: skips.map((s) => ({
      check: s.check,
      subject: s.subject,
      createdAt: s.createdAt,
      by: s.createdBy ? firstName(s.createdBy.name) || s.createdBy.email : null,
    })),
  };
}

/** Every gap and skip, for every live record or the one in `scope`. */
export async function loadMissingInfo(today: Ymd, scope: MissingScope = {}): Promise<MissingInfo> {
  return missingInfo(await checkInput(today, scope), today);
}

/** A lease's gaps: its property's, kept to the rows about this lease and its tenants. */
export async function leaseMissingInfo(leaseId: string, propertyId: string, today: Ymd): Promise<MissingInfo> {
  const all = await loadMissingInfo(today, { propertyId });
  const mine = <G extends { leaseId: string | null }>(g: G) => g.leaseId === leaseId;
  return { gaps: all.gaps.filter(mine), skipped: all.skipped.filter(mine) };
}

/** The Needs you rows for lease ends in their notice window (D5), with any term marked Doesn't apply left out. */
export async function leaseEndRows(today: Ymd): Promise<NeedsYouItem[]> {
  const [leases, skips] = await Promise.all([
    prisma.lease.findMany({
      where: { movesOut: null, property: liveRecord },
      select: {
        id: true,
        unitLabel: true,
        movesIn: true,
        movesOut: true,
        property: { select: { address: true, status: true } },
        terms: { select: { id: true, startsOn: true, endsOn: true } },
      },
    }),
    prisma.missingInfoSkip.findMany({ where: { check: "lease.end" }, select: { subject: true } }),
  ]);
  const input: LeaseEndInput[] = leases
    .filter((l) => l.property.status?.trim().toLowerCase() !== "sold")
    .map((l) => ({ id: l.id, address: l.property.address, unitLabel: l.unitLabel, movesIn: l.movesIn, movesOut: l.movesOut, terms: l.terms }));
  return leaseEndItems(input, today, new Set(skips.map((s) => s.subject)));
}

export interface HandedOff {
  taskId: string;
  /** The assignee's first name, or null with nobody assigned. */
  who: string | null;
}

/** The rows already in an open Make task, by key, so the worklist shows whose they are and doesn't hand them off twice. */
export async function handedOff(): Promise<Record<string, HandedOff>> {
  const items = await prisma.taskChecklistItem.findMany({
    // Open means active (task-scope.ts), so a draft no partner has added hands nothing off.
    where: openMakeTaskItemsWhere,
    select: {
      checkKey: true,
      task: { select: { id: true, assignee: { select: { name: true, email: true } }, assigneeContact: { select: { fullName: true } } } },
    },
  });
  const out: Record<string, HandedOff> = {};
  for (const i of items) {
    if (!i.checkKey) continue;
    const name = i.task.assignee?.name ?? i.task.assignee?.email ?? i.task.assigneeContact?.fullName ?? null;
    out[i.checkKey] = { taskId: i.task.id, who: name ? firstName(name) || name : null };
  }
  return out;
}
