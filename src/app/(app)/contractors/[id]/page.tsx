import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle, Field } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { fmtDate } from "@/lib/utils";
import { fmtDay } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";

export default async function ContractorPage({ params }: PageProps<"/contractors/[id]">) {
  await requireUser();
  const { id } = await params;
  const c = await prisma.contact.findUnique({ where: { id } });
  if (!c) notFound();

  // Tasks assigned to this vendor (matched loosely by name/email — vendors aren't Users).
  const orClauses: import("@prisma/client").Prisma.TaskWhereInput[] = [
    { assigneeName: { contains: c.fullName.split(" ")[0], mode: "insensitive" } },
  ];
  if (c.email) orClauses.push({ assigneeEmail: { equals: c.email, mode: "insensitive" } });

  const tasks = await prisma.task.findMany({
    where: { OR: orClauses },
    orderBy: [{ status: "asc" }, { completedAt: "desc" }],
    include: { property: { select: { id: true, address: true } } },
    take: 60,
  });

  return (
    <>
      <div className="mb-4">
        <BackLink fallback="/contractors" label="Vendors" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{c.fullName}</h1>
          {c.company && <span className="text-sm text-muted">{c.company}</span>}
          {c.tenantFixes && <Badge tone="green">tenant fixes</Badge>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardBody>
            <dl>
              <Field label="Trades">{c.trades ?? "—"}</Field>
              <Field label="Phone">{c.phone ?? "—"}</Field>
              <Field label="Email">{c.email ?? "—"}</Field>
              <Field label="Mailing address">{c.mailingAddress ?? "—"}</Field>
              <Field label="Billing">{c.billingInfo ?? "—"}</Field>
              <Field label="Availability">{c.availability ?? "—"}</Field>
              <Field label="W-9">
                {c.w9Url ? (
                  <a href={c.w9Url} target="_blank" rel="noreferrer" className="text-primary">
                    View ↗
                  </a>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Insurance (COI)">
                {c.coiUrl ? (
                  <a href={c.coiUrl} target="_blank" rel="noreferrer" className="text-primary">
                    View ↗
                  </a>
                ) : (
                  "—"
                )}
              </Field>
            </dl>
            {c.comments && (
              <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-xs text-muted">
                {c.comments}
              </p>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Jobs</CardTitle>
            <span className="text-xs text-muted">
              matched by name/email · {tasks.length} shown
            </span>
          </CardHeader>
          <CardBody className="p-0">
            {tasks.length === 0 ? (
              <p className="p-4 text-sm text-muted">No tasks matched to this vendor.</p>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <Link
                      href={`/tasks/${t.id}`}
                      className={`min-w-0 flex-1 truncate hover:underline ${t.status === "DONE" ? "text-muted line-through" : ""}`}
                    >
                      {t.title}
                    </Link>
                    {t.property && (
                      <Link
                        href={`/properties/${t.property.id}`}
                        className="shrink-0 text-xs text-muted hover:underline"
                      >
                        {shortAddress(t.property.address)}
                      </Link>
                    )}
                    <span className="shrink-0 text-xs text-muted">
                      {t.status === "DONE" ? fmtDate(t.completedAt) : fmtDay(t.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
