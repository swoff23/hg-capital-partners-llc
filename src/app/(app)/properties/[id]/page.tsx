import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle, LinkButton } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { propertyStatusTone } from "@/lib/config";
import { parseUnits } from "@/lib/property-types";
import { BackLink } from "@/components/back-link";
import { EditPropertyDetails } from "./edit-details";
import { EditUnits } from "./edit-units";

function d(v: unknown): string | null {
  return v == null ? null : (v as { toString(): string }).toString();
}

export default async function PropertyPage({ params }: PageProps<"/properties/[id]">) {
  await requireUser();
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }] },
      sourceDeal: { select: { id: true, address: true } },
    },
  });
  if (!property) notFound();
  const units = parseUnits(property.units);
  const openTasks = property.tasks.filter((t) => t.status === "OPEN");
  const doneTasks = property.tasks.filter((t) => t.status === "DONE");

  return (
    <>
      <div className="mb-4">
        <BackLink fallback="/properties" label="Portfolio" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{property.address}</h1>
          {property.status && (
            <Badge tone={propertyStatusTone(property.status)}>{property.status}</Badge>
          )}
          {property.strategy && <Badge tone="gray">{property.strategy}</Badge>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Units &amp; access</CardTitle>
              <span className="text-xs text-muted">{units.length} units</span>
            </CardHeader>
            <CardBody>
              <EditUnits propertyId={property.id} initial={units} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Tasks</CardTitle>
              <LinkButton href={`/tasks/new?propertyId=${property.id}`} size="sm">
                + Task
              </LinkButton>
            </CardHeader>
            <CardBody className="p-0">
              {property.tasks.length === 0 ? (
                <p className="p-4 text-sm text-muted">No tasks linked.</p>
              ) : (
                <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                  {[...openTasks, ...doneTasks].map((t) => (
                    <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <Link
                        href={`/tasks/${t.id}`}
                        className={`min-w-0 flex-1 truncate hover:underline ${t.status === "DONE" ? "text-muted line-through" : ""}`}
                      >
                        {t.title}
                      </Link>
                      {(t.assigneeName || t.assigneeUserId) && (
                        <span className="shrink-0 text-xs text-muted">{t.assigneeName ?? "assigned"}</span>
                      )}
                      {t.dueDate && (
                        <span className="shrink-0 text-xs text-muted">{fmtDate(t.dueDate)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody>
              <EditPropertyDetails
                property={{
                  id: property.id,
                  version: property.updatedAt.toISOString(),
                  address: property.address,
                  llcOwner: property.llcOwner,
                  refiTarget: property.refiTarget,
                  attorney: property.attorney,
                  lender: property.lender,
                  loanServicer: property.loanServicer,
                  status: property.status,
                  strategy: property.strategy,
                  purchaseDate: property.purchaseDate?.toISOString().slice(0, 10) ?? null,
                  refinanceDate: property.refinanceDate?.toISOString().slice(0, 10) ?? null,
                  purchasePrice: d(property.purchasePrice),
                  currentLoan: d(property.currentLoan),
                  value: d(property.value),
                  rehabAmount: d(property.rehabAmount),
                  sqft: property.sqft,
                  unitCount: property.unitCount,
                  notes: property.notes,
                }}
              />
            </CardBody>
          </Card>
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
