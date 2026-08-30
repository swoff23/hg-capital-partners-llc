import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  LinkButton,
  EmptyState,
} from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { propertyStatusTone } from "@/lib/config";
import { parseUnits, UTILITY_LABELS } from "@/lib/property-types";
import { BackLink } from "@/components/back-link";

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
            <CardBody className="space-y-4">
              {units.length === 0 && <EmptyState>No unit-level records imported.</EmptyState>}
              {units.map((u, i) => (
                <div key={i} className="rounded-lg border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-background px-3 py-2">
                    <span className="text-sm font-medium">{u.label || `Unit ${i + 1}`}</span>
                    {u.lockboxCode && (
                      <span className="font-mono text-xs">🔒 {u.lockboxCode}</span>
                    )}
                  </div>
                  <div className="grid gap-x-6 gap-y-1 px-3 py-2 sm:grid-cols-2">
                    {UTILITY_LABELS.map(([k, label]) =>
                      u.utilities?.[k] ? (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-muted">{label}</span>
                          <span className="font-medium">{u.utilities[k]}</span>
                        </div>
                      ) : null,
                    )}
                  </div>
                  {u.equipment && u.equipment.length > 0 && (
                    <div className="border-t border-border px-3 py-2">
                      <div className="mb-1 text-xs font-medium text-muted">Equipment</div>
                      <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                        {u.equipment.map((e, j) => (
                          <div key={j} className="flex justify-between text-xs">
                            <span className="text-muted">{e.type}</span>
                            <span className="font-mono">
                              {[e.model, e.installYear].filter(Boolean).join(" · ") || "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
                <ul className="divide-y divide-border">
                  {[...openTasks, ...doneTasks.slice(0, 20)].map((t) => (
                    <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <Link
                        href={`/tasks/${t.id}`}
                        className={`min-w-0 flex-1 truncate hover:underline ${t.status === "DONE" ? "text-muted line-through" : ""}`}
                      >
                        {t.title}
                      </Link>
                      {t.assigneeName && (
                        <span className="shrink-0 text-xs text-muted">{t.assigneeName}</span>
                      )}
                      {t.dueDate && (
                        <span className="shrink-0 text-xs text-muted">{fmtDate(t.dueDate)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {doneTasks.length > 20 && (
                <p className="px-4 py-2 text-xs text-muted">
                  + {doneTasks.length - 20} more completed
                </p>
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
              <dl>
                <Field label="Entity">{property.llcOwner ?? "—"}</Field>
                {property.refiTarget && <Field label="Refi target">{property.refiTarget}</Field>}
                <Field label="Lender">{property.lender ?? "—"}</Field>
                <Field label="Loan servicer">{property.loanServicer ?? "—"}</Field>
                <Field label="Attorney">{property.attorney ?? "—"}</Field>
                <Field label="Units">{property.unitCount ?? "—"}</Field>
                <Field label="Sq ft">{property.sqft?.toLocaleString() ?? "—"}</Field>
                <Field label="Purchase date">{fmtDate(property.purchaseDate)}</Field>
                <Field label="Purchase price">{fmtMoney(property.purchasePrice)}</Field>
                <Field label="Refinance date">{fmtDate(property.refinanceDate)}</Field>
                <Field label="Current loan">{fmtMoney(property.currentLoan)}</Field>
                <Field label="Value">{fmtMoney(property.value)}</Field>
                {property.rehabAmount != null && (
                  <Field label="Rehab amount">{fmtMoney(property.rehabAmount)}</Field>
                )}
              </dl>
            </CardBody>
          </Card>
          {property.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-wrap text-sm">{property.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
