import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle, LinkButton } from "@/components/ui";
import { fmtDate, initials } from "@/lib/utils";
import { propertyStatusTone } from "@/lib/config";
import { parseUnits, parseBuildingCapex } from "@/lib/property-types";
import { BackLink } from "@/components/back-link";
import { PropertyDetailsSection, PropertyNotesSection } from "./edit-details";
import { UnitsSection } from "./edit-units";
import { BuildingCapexSection } from "./building-capex";
import { CapexForecastCard } from "./capex-outlook";

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
      sourceDeal: { select: { id: true, address: true } },
    },
  });
  if (!property) notFound();
  const units = parseUnits(property.units);
  const buildingCapex = parseBuildingCapex(property.buildingCapex);

  return (
    <>
      <div className="mb-4">
        <BackLink fallback="/properties" label="Portfolio" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{property.address}</h1>
          {property.status && (
            <Badge tone={propertyStatusTone(property.status)}>{property.status}</Badge>
          )}
          {(property.unitCount ?? units.length) > 0 && (
            <span className="text-sm text-muted">
              {property.unitCount ?? units.length} units
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <UnitsSection propertyId={property.id} initial={units} />

          <CapexForecastCard units={units} building={buildingCapex} />

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
        </div>

        <div className="min-w-0 space-y-4">
          <PropertyDetailsSection
            property={{
                  id: property.id,
                  version: property.updatedAt.toISOString(),
                  address: property.address,
                  llcOwner: property.llcOwner,
                  attorney: property.attorney,
                  lender: property.lender,
                  loanServicer: property.loanServicer,
                  status: property.status,
                  purchaseDate: property.purchaseDate?.toISOString().slice(0, 10) ?? null,
                  refinanceDate: property.refinanceDate?.toISOString().slice(0, 10) ?? null,
                  purchasePrice: d(property.purchasePrice),
                  currentLoan: d(property.currentLoan),
                  value: d(property.value),
                  rehabAmount: d(property.rehabAmount),
              sqft: property.sqft,
              unitCount: property.unitCount,
            }}
          />
          <BuildingCapexSection propertyId={property.id} initial={buildingCapex} />
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
