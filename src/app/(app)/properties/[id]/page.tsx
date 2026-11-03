import { notFound } from "next/navigation";
import { after } from "next/server";
import { isActionRender } from "@/lib/action-render";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { preload } from "@/lib/preload";
import { getPropertyById } from "@/lib/properties/read";
import { getPropertyFinancials } from "@/lib/quickbooks/queries";
import { recordView } from "@/lib/recent-views";
import { TextLink } from "@/components/ui";
import { toMoneyNumber } from "@/lib/utils";
import { toYmd, todayYmdEastern } from "@/lib/dates";
import { activeTask, excludeTemplateTasks } from "@/lib/task-scope";
import { byDateThenStatus, isTargetLate } from "@/lib/tasks/list";
import { targetDate } from "@/lib/tasks/rules";
import { loanPosition } from "@/lib/properties/figures";
import { parseBuildingCapex, parseUnits, propertyUnitCount, withUnitIds } from "@/lib/property-types";
import { getCapexRules } from "@/lib/capex-rules";
import { countUnitRefs } from "@/lib/properties/unit-refs";
import { BackLink } from "@/components/back-link";
import { ArchivedNotice, RecordMoreMenu } from "@/components/record-archive";
import { archivedLine } from "@/lib/archive";
import { setPropertyArchived } from "../actions";
import { PropertyStatus } from "../property-status";
import { PropertyAddressField, PropertyDetailsSection, PropertyNotesSection } from "./edit-details";
import { DocumentsSection, propertyDocuments } from "./documents-section";
import { PropertyLoanSection } from "./edit-loan";
import { PropertyInsuranceSection } from "./edit-insurance";
import { UnitsSection } from "./edit-units";
import { ListingsSection, type EditableListing } from "./edit-listings";
import { BuildingCapexSection } from "./building-capex";
import { CapexForecastCard } from "./capex-outlook";
import { PropertyFinancialsCard } from "./financials";
import { PropertyFactStrip } from "./record-strip";
import { PropertyPhoto } from "./property-photo";
import { PropertyTasksSection, type PropertyTask } from "./property-tasks";
import type { Metadata } from "next";
import { recordMetadata } from "@/lib/record-metadata";

/** The tab names the record (record-title.ts), so tabs and history can be told apart. */
export async function generateMetadata({ params }: PageProps<"/properties/[id]">): Promise<Metadata> {
  return recordMetadata("property", (await params).id);
}

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
}): PropertyTask["who"] {
  const name = t.assignee ? t.assignee.name : (t.assigneeContact?.fullName ?? t.assigneeName);
  const email = t.assignee?.email ?? null;
  const label = name ?? email;
  if (!label) return null;
  return { label, name, email, contractor: !!t.assigneeContactId };
}

/**
 * A property's record (docs/brand-guidelines.md, sections 5 and 9): capped at
 * 1200 with a 320 rail from lg. The identity header (photo, status, the
 * address as the h1, entity and units), the four-fact strip, then the work
 * (financials, CapEx, units, rentals) beside the facts rail (details, loan,
 * insurance) and the property's tasks, documents and notes.
 */
export default async function PropertyPage({ params }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  // The Financials card and Documents read their own data further down; they start now, beside the page's reads.
  preload(getPropertyFinancials(id));
  preload(propertyDocuments(id));
  // One wave: the session check runs beside the reads and is awaited with them, so nothing is shown without it.
  const [user, property, openTasks, sourceDeal, propertyListings, capexRules] = await Promise.all([
    requireUser(),
    getPropertyById(id),
    prisma.task.findMany({
      where: { propertyId: id, ...activeTask, ...excludeTemplateTasks },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      include: { assignee: { select: { name: true, email: true } }, assigneeContact: { select: { fullName: true } } },
    }),
    prisma.deal.findUnique({ where: { convertedPropertyId: id }, select: { id: true, address: true } }),
    prisma.listing.findMany({
      where: { propertyId: id },
      orderBy: { createdAt: "asc" },
      include: { photos: { orderBy: { sortOrder: "asc" } } },
    }),
    getCapexRules(),
  ]);
  if (!property) notFound();
  // Who archived it, for the notice: read only for an archived property, so a live one costs no extra query.
  const archivedBy = property.archivedByUserId
    ? await prisma.user.findUnique({ where: { id: property.archivedByUserId }, select: { name: true, email: true } })
    : null;
  // Puts it on top of this person's Recent in search, once the response is out.
  if (!(await isActionRender())) after(() => recordView(user.id, "PROPERTY", property.id));
  const units = parseUnits(property.units);
  const buildingCapex = parseBuildingCapex(property.buildingCapex);
  const listings: EditableListing[] = propertyListings.map((l) => ({
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
  // the date this list shows, so it's the date judged.
  const today = todayYmdEastern();
  const tasks = openTasks
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      waitingOn: t.status === "WAITING" ? t.waitingOn?.trim() || null : null,
      createdAt: t.createdAt,
      target: ymd(targetDate(t)),
      late: isTargetLate({ status: t.status, scheduledFor: ymd(t.scheduledFor), due: ymd(t.dueDate) }, today),
      who: taskAssignee(t),
    }))
    .sort(byDateThenStatus((t) => t.target));

  const value = d(property.value);
  const balance = d(property.currentLoan);
  const position = loanPosition(value, balance);
  const subline = [property.llcOwner?.trim(), unitCount > 0 && `${unitCount} ${unitCount === 1 ? "unit" : "units"}`]
    .filter(Boolean)
    .join(" · ");
  const version = property.updatedAt.toISOString();

  return (
    <div className="max-w-300">
      <BackLink fallback="/properties" label="Portfolio" />

      {/* Identity: the building's photo (the fallback tile until it's taken), status, address, entity and units. */}
      <header className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        {/* Full width at 16:9 on a phone, often held at the building; 96x72 beside the title from sm. */}
        <PropertyPhoto property={{ id: property.id, address: property.address, photoUrl: property.photoUrl }} canEdit />
        <div className="min-w-0">
          {property.status && (
            <p className="text-meta">
              <PropertyStatus status={property.status} />
            </p>
          )}
          {/* The ⋯ menu is centered on the address's first line, as on a task's page: the heading's 4px padding and half its line, less half the 32px button (44 on touch). */}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <PropertyAddressField id={property.id} value={property.address} />
            </div>
            <div className="shrink-0 pt-1 pointer-coarse:-mt-px pointer-coarse:pt-0">
              <RecordMoreMenu
                kind="property"
                id={property.id}
                href={`/properties/${property.id}`}
                archived={!!property.archivedAt}
                action={setPropertyArchived}
              />
            </div>
          </div>
          {subline && <p className="text-meta text-fg-3">{subline}</p>}
        </div>
      </header>

      {property.archivedAt && (
        <ArchivedNotice
          className="mt-4"
          kind="property"
          id={property.id}
          line={archivedLine(archivedBy, property.archivedAt)}
          action={setPropertyArchived}
        />
      )}

      {/* Open tasks isn't repeated here: the Tasks section shows its count. */}
      <PropertyFactStrip
        className="mt-6"
        property={{ value: toMoneyNumber(property.value), balance: toMoneyNumber(property.currentLoan) }}
        position={position}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10 pointer-coarse:mt-6">
        <div className="min-w-0 space-y-8 pointer-coarse:space-y-6">
          <PropertyFinancialsCard propertyId={property.id} />

          <CapexForecastCard units={units} building={buildingCapex} rules={capexRules} />

          <BuildingCapexSection propertyId={property.id} version={version} initial={buildingCapex} rules={capexRules} />

          <UnitsSection
            propertyId={property.id}
            address={property.address}
            version={version}
            // Every unit with an id, so the save can tell a rename from a remove and an add.
            initial={withUnitIds(units)}
            rules={capexRules}
            // What names each unit, so removing one that's still in use asks first.
            unitRefs={countUnitRefs(openTasks, propertyListings)}
          />

          <ListingsSection propertyId={property.id} version={version} initial={listings} unitLabels={unitLabels} />
        </div>

        {/* The facts rail, then the property's tasks, documents and notes. Sections sit 32px apart, 24 on touch. */}
        <div className="min-w-0 space-y-8 pointer-coarse:space-y-6">
          <PropertyDetailsSection
            property={{
              id: property.id,
              address: property.address,
              llcOwner: property.llcOwner,
              attorney: property.attorney,
              status: property.status,
              showOnMoveInForm: property.showOnMoveInForm,
              strategy: property.strategy,
              refiTarget: property.refiTarget,
              purchaseDate: ymd(property.purchaseDate),
              purchasePrice: d(property.purchasePrice),
              closingCosts: d(property.closingCosts),
              rehabAmount: d(property.rehabAmount),
              value,
              refinanceDate: ymd(property.refinanceDate),
              sqft: property.sqft,
              rentalRegistrationExpiry: ymd(property.rentalRegistrationExpiry),
              propertyTaxDueDate: ymd(property.propertyTaxDueDate),
            }}
          />

          <PropertyLoanSection
            loan={{
              id: property.id,
              address: property.address,
              value,
              currentLoan: balance,
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
              address: property.address,
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

          <PropertyTasksSection propertyId={property.id} tasks={tasks} today={today} />

          <DocumentsSection propertyId={property.id} />

          <PropertyNotesSection id={property.id} notes={property.notes} />
          {sourceDeal && (
            <p className="text-meta text-fg-3">
              From deal <TextLink href={`/deals/${sourceDeal.id}`}>{sourceDeal.address}</TextLink>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
