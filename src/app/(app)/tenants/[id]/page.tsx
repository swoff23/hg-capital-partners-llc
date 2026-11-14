import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { toYmd, todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { leasePage } from "@/lib/tenants/queries";
import { dayAfter } from "@/lib/tenants/status";
import { LeasePageView } from "./view";
import type { Metadata } from "next";
import { recordMetadata } from "@/lib/record-metadata";

/** The tab names the household's home (record-title.ts), so tabs and history can be told apart. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return recordMetadata("lease", (await params).id);
}

/**
 * A lease (docs/specs/tenants.md section 6): loads it and shapes it for
 * LeasePageView (./view.tsx). The id is the lease's, not a tenant's.
 */
export default async function LeasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const today = todayYmdEastern();
  const data = await leasePage(id, today);
  if (!data) notFound();
  const { lease, status, home, now, others } = data;

  const terms = lease.terms.map((t) => ({
    id: t.id,
    startsOn: toYmd(t.startsOn)!,
    endsOn: toYmd(t.endsOn),
    rent: Number(t.rent),
    subsidy: t.subsidy ? Number(t.subsidy) : null,
    file: t.file ? { id: t.file.id, filename: t.file.filename } : null,
  }));
  const last = lease.terms[0];
  const lastEnd = toYmd(last?.endsOn);
  const names = lease.tenants.map((t) => t.tenant.fullName);

  return (
    <LeasePageView
      leaseId={lease.id}
      status={status}
      street={shortAddress(lease.property.address)}
      unitLabel={lease.unitLabel}
      propertyId={lease.propertyId}
      notes={lease.notes}
      today={today}
      tenants={lease.tenants.map((t) => ({
        id: t.tenantId,
        fullName: t.tenant.fullName,
        phone: t.tenant.phone,
        phoneE164: t.tenant.phoneE164,
        email: t.tenant.email,
        emergencyName: t.tenant.emergencyName,
        emergencyPhone: t.tenant.emergencyPhone,
        notes: t.tenant.notes,
        primary: t.primary,
      }))}
      terms={terms}
      termDefaults={{
        // The day after the last term ends; a month-to-month last term leaves the day for staff to enter.
        startsOn: last ? (lastEnd ? dayAfter(lastEnd) : "") : (toYmd(lease.movesIn) ?? today),
        rent: last ? String(Number(last.rent)) : "",
        subsidyFrom: last?.subsidyFrom ?? "",
        first: lease.terms.length === 0,
      }}
      facts={{
        leaseId: lease.id,
        status,
        home,
        names,
        property: { id: lease.propertyId, label: shortAddress(lease.property.address) },
        unitLabel: lease.unitLabel,
        movesIn: toYmd(lease.movesIn),
        movesOut: toYmd(lease.movesOut),
        deposit: lease.deposit ? String(Number(lease.deposit)) : "",
        term: now
          ? {
              id: now.term.id,
              rent: String(Number(now.term.rent)),
              subsidy: now.term.subsidy ? String(Number(now.term.subsidy)) : "",
              endsOn: toYmd(now.term.endsOn),
            }
          : null,
      }}
      earlier={others}
    />
  );
}
