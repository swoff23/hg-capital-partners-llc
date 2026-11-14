import Link from "next/link";
import type { TaskStatus } from "@prisma/client";
import { BackLink } from "@/components/back-link";
import { StatusMark } from "@/components/status-badge";
import { Section } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { LEASE_STATUS_LABEL, type LeaseStatus } from "@/lib/tenants/status";
import { cn } from "@/lib/utils";
import { EarlierAtUnit, type EarlierLease } from "./earlier";
import { LeaseFacts, type FactValues } from "./facts";
import { MoreMenu } from "./header";
import { LeaseNotes } from "./notes";
import type { TenantRow } from "./tenant-sheet";
import { TenantsSection } from "./tenants-section";
import { TermSheetProvider, type TermDefaults } from "./term-sheet";
import { TermsSection, type TermRow } from "./terms-section";

/** Upcoming is the clock, Current the half ring, Past the slashed ring: the status marks' ring family. */
const MARK: Record<LeaseStatus, TaskStatus> = { upcoming: "SCHEDULED", current: "IN_PROGRESS", past: "CANCELED" };

export type LeasePageViewProps = {
  leaseId: string;
  status: LeaseStatus;
  /** The street, linked to the property, and the unit after it ("Front"), when there is one. */
  street: string;
  unitLabel: string | null;
  propertyId: string;
  notes: string | null;
  today: Ymd;
  tenants: TenantRow[];
  terms: TermRow[];
  termDefaults: TermDefaults;
  facts: FactValues;
  earlier: EarlierLease[];
};

/**
 * The lease page's layout (docs/specs/tenants.md section 6): the task page's
 * grid. A main column and a 320px Details rail from lg; below that the facts
 * are a row of chips under the title and the sections stack. Back and the
 * status on the first row with the ⋯, the title on its own line below.
 */
export function LeasePageView(p: LeasePageViewProps) {
  const home = p.facts.home;
  return (
    <TermSheetProvider leaseId={p.leaseId} today={p.today} defaults={p.termDefaults}>
      <div
        className={
          "grid max-w-300 gap-x-10 [grid-template-areas:'head'_'fields'_'main'] " +
          "lg:grid-cols-[minmax(0,1fr)_20rem] lg:[grid-template-areas:'head_fields'_'main_fields']"
        }
      >
        <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 [grid-area:head] [grid-template-areas:'nav_more'_'title_title']">
          <div className="flex min-w-0 items-center gap-1.5 [grid-area:nav]">
            <BackLink fallback="/tenants" label="Tenants" />
            <span aria-hidden="true" className="text-meta text-muted-foreground">
              /
            </span>
            <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-meta", p.status === "past" ? "text-muted-foreground" : "text-fg-2")}>
              <StatusMark status={MARK[p.status]} className="text-current" />
              {LEASE_STATUS_LABEL[p.status]}
            </span>
          </div>
          <div className="[grid-area:more]">
            <MoreMenu leaseId={p.leaseId} />
          </div>
          <h1 className="min-w-0 py-1 text-title font-semibold text-foreground [grid-area:title] [overflow-wrap:anywhere]">
            <Link href={`/properties/${p.propertyId}`} className="decoration-1 underline-offset-4 hover:underline">
              {p.street}
            </Link>
            {p.unitLabel && <span> · {p.unitLabel}</span>}
          </h1>
        </header>

        <aside aria-label="Lease details" className="min-w-0 [grid-area:fields] lg:sticky lg:top-20 lg:self-start">
          <Section title="Details" className="max-lg:[&>div:first-child]:hidden max-lg:[&>div:last-child]:pt-0">
            <LeaseFacts {...p.facts} />
          </Section>
        </aside>

        <div className="min-w-0 space-y-8 pt-2 [grid-area:main] pointer-coarse:space-y-6 lg:pt-4">
          <TenantsSection leaseId={p.leaseId} tenants={p.tenants} />
          <TermsSection leaseId={p.leaseId} terms={p.terms} />
          <Section title="Notes">
            <LeaseNotes leaseId={p.leaseId} value={p.notes} home={home} />
          </Section>
          <EarlierAtUnit leases={p.earlier} />
        </div>
      </div>
    </TermSheetProvider>
  );
}
