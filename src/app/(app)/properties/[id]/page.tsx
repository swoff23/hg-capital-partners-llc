import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle, LinkButton, TextLink } from "@/components/ui";
import { fmtDay, toYmd, todayYmdEastern } from "@/lib/dates";
import { propertyStatusTone } from "@/lib/config";
import { activeTask, excludeTemplateTasks } from "@/lib/task-scope";
import { byDateThenStatus, isTargetLate } from "@/lib/tasks/list";
import { cn } from "@/lib/utils";
import { targetDate } from "@/lib/tasks/rules";
import { Avatar } from "@/components/avatar";
import { StatusBadge } from "@/components/status-badge";
import { parseBuildingCapex, parseUnits, propertyUnitCount, withUnitIds } from "@/lib/property-types";
import { getCapexRules } from "@/lib/capex-rules";
import { countUnitRefs } from "@/lib/properties/unit-refs";
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

/** Who a task is assigned to, for the row's avatar: null if unassigned. */
function taskAssignee(t: {
  assigneeName: string | null;
  assigneeContactId: string | null;
  assignee: { name: string | null; email: string } | null;
  assigneeContact: { fullName: string } | null;
}): { label: string; name: string | null; email: string | null; contractor: boolean } | null {
  const name = t.assignee ? t.assignee.name : (t.assigneeContact?.fullName ?? t.assigneeName);
  const email = t.assignee?.email ?? null;
  const label = name ?? email;
  if (!label) return null;
  return { label, name, email, contractor: !!t.assigneeContactId };
}

export default async function PropertyPage({ params }: PageProps<"/properties/[id]">) {
  await requireUser();
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      tasks: {
        where: { ...activeTask, ...excludeTemplateTasks },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
        include: { assignee: { select: { name: true, email: true } }, assigneeContact: { select: { fullName: true } } },
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

  const unitCount = propertyUnitCount(property) ?? 0;
  const unitLabels = [...new Set(units.map((u) => u.label?.trim()).filter((l): l is string => !!l))];

  // Each task's Target (D7: the visit date while Scheduled, otherwise Due), soonest first, as on Today.
  // A past Target reads red by Today's rule (isTargetLate: never Waiting or Review); it's
  // the date this card shows, so it's the date judged.
  const today = todayYmdEastern();
  const tasks = property.tasks
    .map((t) => ({
      ...t,
      target: ymd(targetDate(t)),
      late: isTargetLate({ status: t.status, scheduledFor: ymd(t.scheduledFor), due: ymd(t.dueDate) }, today),
    }))
    .sort(byDateThenStatus((t) => t.target));

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
            // Every unit with an id, so the save can tell a rename from a remove and an add.
            initial={withUnitIds(units)}
            rules={capexRules}
            // What names each unit, so removing one that's still in use asks first.
            unitRefs={countUnitRefs(property.tasks, property.listings)}
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
              address: property.address,
              llcOwner: property.llcOwner,
              attorney: property.attorney,
              status: property.status,
              strategy: property.strategy,
              refiTarget: property.refiTarget,
              purchaseDate: ymd(property.purchaseDate),
              purchasePrice: d(property.purchasePrice),
              closingCosts: d(property.closingCosts),
              rehabAmount: d(property.rehabAmount),
              value: d(property.value),
              refinanceDate: ymd(property.refinanceDate),
              sqft: property.sqft,
              rentalRegistrationExpiry: ymd(property.rentalRegistrationExpiry),
              propertyTaxDueDate: ymd(property.propertyTaxDueDate),
            }}
          />

          <PropertyLoanSection
            loan={{
              id: property.id,
              value: d(property.value),
              currentLoan: d(property.currentLoan),
              lender: property.lender,
              loanServicer: property.loanServicer,
              loanNumber: property.loanNumber,
              loanType: property.loanType,
              loanOriginalAmount: d(property.loanOriginalAmount),
              loanRate: d(property.loanRate),
              loanPaymentMonthly: d(property.loanPaymentMonthly),
              loanEscrow: property.loanEscrow,
              loanOriginationDate: ymd(property.loanOriginationDate),
              loanMaturityDate: ymd(property.loanMaturityDate),
            }}
          />

          <PropertyInsuranceSection
            insurance={{
              id: property.id,
              insuranceCarrier: property.insuranceCarrier,
              insurancePolicyNo: property.insurancePolicyNo,
              insurancePremium: d(property.insurancePremium),
              insuranceCoverage: d(property.insuranceCoverage),
              insuranceDeductible: d(property.insuranceDeductible),
              insuranceLiability: property.insuranceLiability,
              insuranceRenewalDate: ymd(property.insuranceRenewalDate),
              replacementCost: d(property.replacementCost),
            }}
          />

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Tasks</CardTitle>
              <div className="flex shrink-0 items-center gap-2">
                <LinkButton href={`/templates?property=${property.id}`} size="sm">
                  Apply playbook
                </LinkButton>
                <LinkButton href={`/tasks/new?propertyId=${property.id}`} size="sm">
                  + Task
                </LinkButton>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {tasks.length === 0 ? (
                <p className="p-4 text-sm text-muted">No open tasks.</p>
              ) : (
                <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                  {tasks.map((t) => {
                    const who = taskAssignee(t);
                    return (
                      <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          {t.title}
                        </Link>
                        {(t.assigneeContactId || t.status !== "OPEN") && (
                          <StatusBadge status={t.status} className="shrink-0" />
                        )}
                        {who && (
                          <span title={who.label} className="flex shrink-0">
                            <Avatar name={who.name} email={who.email} size={20} outline={who.contractor} />
                            <span className="sr-only">{who.label}</span>
                          </span>
                        )}
                        <span
                          className={cn(
                            "w-24 shrink-0 text-right text-xs",
                            t.late ? "text-red-600 dark:text-red-400" : "text-muted",
                          )}
                        >
                          {fmtDay(t.target, { year: "auto", now: today })}
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

          <PropertyNotesSection id={property.id} notes={property.notes} />
          {property.sourceDeal && (
            <p className="text-xs text-muted">
              From deal{" "}
              <TextLink href={`/deals/${property.sourceDeal.id}`}>{property.sourceDeal.address}</TextLink>
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
