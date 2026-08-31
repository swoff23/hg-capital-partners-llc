import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle, LinkButton } from "@/components/ui";
import { fmtDate, initials } from "@/lib/utils";
import { propertyStatusTone } from "@/lib/config";
import { capexForecast, parseBuildingCapex, parsePropertyLinks, parseUnits } from "@/lib/property-types";
import { BackLink } from "@/components/back-link";
import { PropertyDetailsSection, PropertyNotesSection } from "./edit-details";
import { PropertyDocumentsSection } from "./edit-links";
import { PropertyLoanSection } from "./edit-loan";
import { PropertyInsuranceSection } from "./edit-insurance";
import { PropertySummary } from "./property-summary";
import { UnitsSection } from "./edit-units";
import { BuildingCapexSection } from "./building-capex";
import { CapexForecastCard } from "./capex-outlook";

const ymd = (dt: Date | null) => dt?.toISOString().slice(0, 10) ?? null;

function d(v: unknown): string | null {
  return v == null ? null : (v as { toString(): string }).toString();
}
function n(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v as number);
  return Number.isFinite(x) ? x : null;
}

/** Who a task is assigned to: full label + initials, or null if unassigned. */
function taskAssignee(t: {
  assigneeName: string | null;
  assignee: { name: string | null; email: string } | null;
}): { label: string; initials: string } | null {
  const label = t.assignee?.name ?? t.assignee?.email ?? t.assigneeName;
  if (!label) return null;
  const forInitials = label.includes("@") ? label.split("@")[0].replace(/[._-]+/g, " ") : label;
  return { label, initials: initials(forInitials) };
}

export default async function PropertyPage({ params }: PageProps<"/properties/[id]">) {
  await requireUser();
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      tasks: {
        where: { status: "OPEN" },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
        include: { assignee: { select: { name: true, email: true } } },
      },
      sourceDeal: { select: { id: true, address: true } },
    },
  });
  if (!property) notFound();
  const units = parseUnits(property.units);
  const buildingCapex = parseBuildingCapex(property.buildingCapex);
  const links = parsePropertyLinks(property.links);
  const forecast = capexForecast(units, { years: 5, building: buildingCapex });

  const unitCount = units.length || property.unitCount || 0;
  const purchasePrice = n(property.purchasePrice);
  const rehabAmount = n(property.rehabAmount);
  const closingCosts = n(property.closingCosts);
  const allInBasis =
    purchasePrice != null || rehabAmount != null || closingCosts != null
      ? (purchasePrice ?? 0) + (rehabAmount ?? 0) + (closingCosts ?? 0)
      : null;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}`;

  // Key dates → the summary's "next" tile, falling back to the soonest dated task.
  const keyDates = (
    [
      { label: "Loan matures", date: property.loanMaturityDate },
      { label: "Insurance renews", date: property.insuranceRenewalDate },
      { label: "Property tax due", date: property.propertyTaxDueDate },
      { label: "Rental registration", date: property.rentalRegistrationExpiry },
    ] as { label: string; date: Date | null }[]
  )
    .filter((k): k is { label: string; date: Date } => !!k.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const nextTaskDue = property.tasks.find((t) => t.dueDate)?.dueDate ?? null;
  const nextKeyDate =
    keyDates[0] ?? (nextTaskDue ? { label: "Next task due", date: nextTaskDue } : null);

  return (
    <>
      <div className="mb-4">
        <BackLink fallback="/properties" label="Portfolio" />
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{property.address}</h1>
          {property.status && (
            <Badge tone={propertyStatusTone(property.status)}>{property.status}</Badge>
          )}
          {unitCount > 0 && <span className="text-sm text-muted">{unitCount} units</span>}
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Maps ↗
          </a>
        </div>
      </div>

      <div className="mb-4">
        <PropertySummary
          allInBasis={allInBasis}
          value={n(property.value)}
          currentLoan={n(property.currentLoan)}
          capexDueSoon={forecast.dueNowTotal}
          nextKeyDate={nextKeyDate}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <CapexForecastCard units={units} building={buildingCapex} />

          <BuildingCapexSection propertyId={property.id} initial={buildingCapex} />

          <UnitsSection propertyId={property.id} initial={units} />
        </div>

        <div className="min-w-0 space-y-4">
          <PropertyDetailsSection
            property={{
              id: property.id,
              version: property.updatedAt.toISOString(),
              address: property.address,
              llcOwner: property.llcOwner,
              attorney: property.attorney,
              status: property.status,
              strategy: property.strategy,
              purchaseDate: ymd(property.purchaseDate),
              purchasePrice: d(property.purchasePrice),
              closingCosts: d(property.closingCosts),
              value: d(property.value),
              replacementCost: d(property.replacementCost),
              rehabAmount: d(property.rehabAmount),
              rehabMonths: d(property.rehabMonths),
              sqft: property.sqft,
              propertyTaxDueDate: ymd(property.propertyTaxDueDate),
              rentalRegistrationExpiry: ymd(property.rentalRegistrationExpiry),
            }}
          />

          <PropertyLoanSection
            loan={{
              id: property.id,
              version: property.updatedAt.toISOString(),
              lender: property.lender,
              loanServicer: property.loanServicer,
              loanNumber: property.loanNumber,
              loanType: property.loanType,
              loanOriginalAmount: d(property.loanOriginalAmount),
              currentLoan: d(property.currentLoan),
              loanRate: d(property.loanRate),
              loanPaymentMonthly: d(property.loanPaymentMonthly),
              loanOriginationDate: ymd(property.loanOriginationDate),
              loanMaturityDate: ymd(property.loanMaturityDate),
              refinanceDate: ymd(property.refinanceDate),
              refiTarget: property.refiTarget,
              loanEscrow: property.loanEscrow,
            }}
          />

          <PropertyInsuranceSection
            insurance={{
              id: property.id,
              version: property.updatedAt.toISOString(),
              insuranceCarrier: property.insuranceCarrier,
              insurancePolicyNo: property.insurancePolicyNo,
              insuranceCoverage: d(property.insuranceCoverage),
              insuranceDeductible: d(property.insuranceDeductible),
              insuranceLiability: property.insuranceLiability,
              insurancePremium: d(property.insurancePremium),
              insuranceRenewalDate: ymd(property.insuranceRenewalDate),
            }}
          />

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Tasks</CardTitle>
              <LinkButton href={`/tasks/new?propertyId=${property.id}`} size="sm">
                + Task
              </LinkButton>
            </CardHeader>
            <CardBody className="p-0">
              {property.tasks.length === 0 ? (
                <p className="p-4 text-sm text-muted">No open tasks.</p>
              ) : (
                <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                  {property.tasks.map((t) => {
                    const who = taskAssignee(t);
                    return (
                      <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          {t.title}
                        </Link>
                        {who && (
                          <span
                            title={who.label}
                            className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded bg-accent px-1 text-[10px] font-semibold text-primary"
                          >
                            {who.initials}
                          </span>
                        )}
                        <span className="w-24 shrink-0 text-right text-xs text-muted">
                          {t.dueDate ? fmtDate(t.dueDate) : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <PropertyDocumentsSection
            key={property.updatedAt.toISOString()}
            id={property.id}
            links={links}
          />

          <PropertyNotesSection
            id={property.id}
            version={property.updatedAt.toISOString()}
            notes={property.notes}
          />
          {property.sourceDeal && (
            <p className="text-xs text-muted">
              From deal{" "}
              <Link href={`/deals/${property.sourceDeal.id}`} className="text-primary hover:underline">
                {property.sourceDeal.address}
              </Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
