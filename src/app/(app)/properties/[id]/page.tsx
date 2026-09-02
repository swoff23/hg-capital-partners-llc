import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle, LinkButton } from "@/components/ui";
import { initials } from "@/lib/utils";
import { fmtDay, toYmd } from "@/lib/dates";
import { propertyStatusTone } from "@/lib/config";
import { parseBuildingCapex, parseUnits } from "@/lib/property-types";
import { getCapexRules } from "@/lib/capex-rules";
import { BackLink } from "@/components/back-link";
import { PropertyAddressField, PropertyDetailsSection, PropertyNotesSection } from "./edit-details";
import { PropertyDocumentsSection } from "./edit-documents";
import { PropertyLoanSection } from "./edit-loan";
import { PropertyInsuranceSection } from "./edit-insurance";
import { UnitsSection } from "./edit-units";
import { ListingsSection, type EditableListing } from "./edit-listings";
import { BuildingCapexSection } from "./building-capex";
import { CapexForecastCard } from "./capex-outlook";
import { PropertyFinancialsCard } from "./financials";

const ymd = toYmd;

function d(v: unknown): string | null {
  return v == null ? null : (v as { toString(): string }).toString();
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
      attachments: { orderBy: { createdAt: "asc" } },
      sourceDeal: { select: { id: true, address: true } },
      listings: {
        orderBy: { createdAt: "asc" },
        include: { photos: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!property) notFound();
  const units = parseUnits(property.units);
  const buildingCapex = parseBuildingCapex(property.buildingCapex);
  const capexRules = await getCapexRules();
  const listings: EditableListing[] = property.listings.map((l) => ({
    id: l.id,
    unitLabel: l.unitLabel,
    zillowUrl: l.zillowUrl ?? "",
    rent: l.rent?.toString() ?? "",
    beds: l.beds ?? "",
    baths: l.baths ?? "",
    sqft: l.sqft?.toString() ?? "",
    availableDate: ymd(l.availableDate) ?? "",
    status: l.status,
    photos: l.photos.map((p) => ({ url: p.url, pathname: p.pathname })),
  }));

  const unitCount = units.length || property.unitCount || 0;
  const unitLabels = [...new Set(units.map((u) => u.label?.trim()).filter((l): l is string => !!l))];

  return (
    <>
      <div className="mb-4">
        <BackLink fallback="/properties" label="Portfolio" />
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <PropertyAddressField id={property.id} value={property.address} />
          {property.status &&
            (property.status === "Refinanced" ? (
              <span className="text-sm text-muted">{property.status}</span>
            ) : (
              <Badge tone={propertyStatusTone(property.status)}>{property.status}</Badge>
            ))}
          {unitCount > 0 && <span className="text-sm text-muted">{unitCount} units</span>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <PropertyFinancialsCard propertyId={property.id} />

          <CapexForecastCard units={units} building={buildingCapex} rules={capexRules} />

          <BuildingCapexSection
            propertyId={property.id}
            version={property.updatedAt.toISOString()}
            initial={buildingCapex}
            rules={capexRules}
          />

          <UnitsSection
            propertyId={property.id}
            version={property.updatedAt.toISOString()}
            initial={units}
            rules={capexRules}
          />

          <ListingsSection
            propertyId={property.id}
            version={property.updatedAt.toISOString()}
            initial={listings}
            unitLabels={unitLabels}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <PropertyDetailsSection
            property={{
              id: property.id,
              version: property.updatedAt.toISOString(),
              address: property.address,
              llcOwner: property.llcOwner,
              status: property.status,
              strategy: property.strategy,
              purchaseDate: ymd(property.purchaseDate),
              purchasePrice: d(property.purchasePrice),
              value: d(property.value),
              refinanceDate: ymd(property.refinanceDate),
              sqft: property.sqft,
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
              loanOriginalAmount: d(property.loanOriginalAmount),
              loanRate: d(property.loanRate),
              loanPaymentMonthly: d(property.loanPaymentMonthly),
              loanOriginationDate: ymd(property.loanOriginationDate),
              loanMaturityDate: ymd(property.loanMaturityDate),
            }}
          />

          <PropertyInsuranceSection
            insurance={{
              id: property.id,
              version: property.updatedAt.toISOString(),
              insuranceCarrier: property.insuranceCarrier,
              insurancePolicyNo: property.insurancePolicyNo,
              insurancePremium: d(property.insurancePremium),
              insuranceRenewalDate: ymd(property.insuranceRenewalDate),
              replacementCost: d(property.replacementCost),
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
                          {fmtDay(t.dueDate)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <PropertyDocumentsSection
            propertyId={property.id}
            attachments={property.attachments.map((a) => ({ id: a.id, filename: a.filename, size: a.size }))}
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
