import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Badge, Card, CardBody, CardHeader, CardTitle, Field } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { StatusBadge } from "@/components/status-badge";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { fmtDay } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { excludeTemplateTasks, isActiveStatus, statusRank } from "@/lib/task-scope";
import { cleanTrades, docOnFile, mailtoHref, telHref } from "@/lib/contacts";
import { ContactLink } from "../contact-link";
import { PortalAccessCard } from "./portal-access-card";

/**
 * The origin for the sign-in link in the login text: APP_URL, or this
 * request's own origin until APP_URL is set (getEnv().appUrl throws in
 * production without it, which would take the whole page down).
 */
async function signInOrigin(): Promise<string> {
  const env = getEnv();
  if (env.APP_URL) return env.appUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : env.appUrl;
}

export default async function ContractorPage({ params }: PageProps<"/contractors/[id]">) {
  const me = await requireUser();
  const { id } = await params;
  const c = await prisma.contact.findUnique({
    where: { id },
    include: {
      // Never the password hash: only what the Portal access card shows.
      portalAccount: { select: { id: true, email: true, status: true, lastSignInAt: true } },
    },
  });
  if (!c) notFound();

  // Their jobs: tasks actually assigned to this contact, never a playbook's
  // template rows. The list stops at 60; the count is all of them.
  const jobsWhere = { assigneeContactId: c.id, ...excludeTemplateTasks };
  const [rows, jobCount] = await Promise.all([
    prisma.task.findMany({
      where: jobsWhere,
      orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { dueDate: { sort: "asc", nulls: "last" } }],
      include: { property: { select: { id: true, address: true } } },
      take: 60,
    }),
    prisma.task.count({ where: jobsWhere }),
  ]);
  const tasks = rows.sort((a, b) => statusRank(a.status) - statusRank(b.status));

  return (
    <>
      <div className="mb-4">
        <BackLink fallback="/contractors" label="Contractors" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{c.fullName}</h1>
          {c.company && <span className="text-sm text-muted">{c.company}</span>}
          {c.tenantFixes && <Badge tone="green">tenant fixes</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardBody>
              <dl>
                <Field label="Trades">{cleanTrades(c.trades) ?? "—"}</Field>
                <Field label="Phone">
                  <ContactLink href={telHref(c.phoneE164 ?? c.phone)}>{c.phone ?? "—"}</ContactLink>
                </Field>
                <Field label="Email">
                  <ContactLink href={mailtoHref(c.email)}>{c.email ?? "—"}</ContactLink>
                </Field>
                <Field label="Mailing address">{c.mailingAddress ?? "—"}</Field>
                <Field label="Billing">{c.billingInfo ?? "—"}</Field>
                <Field label="Availability">{c.availability ?? "—"}</Field>
                <Field label="W-9">
                  {c.w9Url ? (
                    <a href={c.w9Url} target="_blank" rel="noreferrer" className="text-primary">
                      View ↗
                    </a>
                  ) : docOnFile(c.comments, "W-9") ? (
                    "On file"
                  ) : (
                    "—"
                  )}
                </Field>
                <Field label="Insurance (COI)">
                  {c.coiUrl ? (
                    <a href={c.coiUrl} target="_blank" rel="noreferrer" className="text-primary">
                      View ↗
                    </a>
                  ) : docOnFile(c.comments, "Insurance") ? (
                    "On file"
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

          <PortalAccessCard
            contactId={c.id}
            contactName={c.fullName}
            defaultEmail={c.email}
            phone={c.phoneE164 ?? c.phone}
            staffName={me.name ?? me.email}
            appUrl={await signInOrigin()}
            account={
              c.portalAccount
                ? {
                    id: c.portalAccount.id,
                    email: c.portalAccount.email,
                    active: c.portalAccount.status === "ACTIVE",
                    lastSignIn: c.portalAccount.lastSignInAt ? fmtDateTime(c.portalAccount.lastSignInAt) : null,
                  }
                : null
            }
          />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Jobs</CardTitle>
            {jobCount > 0 && <span className="text-xs tabular-nums text-muted">{jobCount}</span>}
          </CardHeader>
          <CardBody className="p-0">
            {tasks.length === 0 ? (
              <p className="p-4 text-sm text-muted">No jobs assigned yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((t) => {
                  const closed = !isActiveStatus(t.status);
                  return (
                    <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <Link
                        href={`/tasks/${t.id}`}
                        className={`min-w-0 flex-1 truncate hover:underline ${closed ? "text-muted line-through" : ""}`}
                      >
                        {t.title}
                      </Link>
                      {t.property && (
                        <Link
                          href={`/properties/${t.property.id}`}
                          className="hidden shrink-0 text-xs text-muted hover:underline sm:inline"
                        >
                          {shortAddress(t.property.address)}
                        </Link>
                      )}
                      {!closed && <StatusBadge status={t.status} className="shrink-0" />}
                      <span className="w-24 shrink-0 text-right text-xs text-muted">
                        {closed ? fmtDate(t.completedAt) : fmtDay(t.dueDate)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
