import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Badge, Section, textLinkClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { STATUS_TONE, StatusBadge, StatusMark } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { daysUntil, fmtDay, toYmd, todayYmdEastern, ymdToDate, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { portalAccess } from "@/lib/portal/access-state";
import { STATUS_LABEL, excludeTemplateTasks, isActiveStatus, statusRank } from "@/lib/task-scope";
import { isTargetLate, targetOf } from "@/lib/tasks/list";
import { cleanTrades, docOnFile, mailtoHref, mapsHref, telHref, textHref } from "@/lib/contacts";
import { firstName } from "@/lib/names";
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

/**
 * A row's date (docs/brand-guidelines.md, section 3): Today, Tomorrow, a
 * weekday within six days, then "Oct 30", with the year only when it isn't
 * this year.
 */
function dayLabel(day: Ymd, today: Ymd): string {
  const d = daysUntil(day, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d != null && d > 1 && d < 7) {
    return ymdToDate(day)!.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
  }
  return fmtDay(day, { year: "auto", now: today });
}

/**
 * One fact in the rail: a 112px label column (96 on phones) beside the value,
 * on a --line divider (section 5). An empty value is the dash in --fg-3.
 */
function Detail({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-3 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)] pointer-coarse:py-3">
      <dt className="text-meta text-fg-3">{label}</dt>
      <dd className="min-w-0 text-body text-fg-1 wrap-anywhere">{children ?? <span className="text-fg-3">—</span>}</dd>
    </div>
  );
}

/** A document opened in a new tab, so the record stays open behind it. */
function DocLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={textLinkClass}>
      View
      <ArrowUpRight className="ml-0.5 inline size-3.5 align-middle" aria-hidden="true" />
    </a>
  );
}

export default async function ContractorPage({ params }: PageProps<"/contractors/[id]">) {
  const me = await requireUser();
  const { id } = await params;
  const c = await prisma.contact.findUnique({
    where: { id },
    include: {
      // Never the password hash: only what the Portal access card shows.
      portalAccount: {
        select: { id: true, email: true, status: true, mustChangePassword: true, lastSignInAt: true, lastSeenAt: true },
      },
    },
  });
  if (!c) notFound();
  const phone = c.phoneE164 ?? c.phone;
  const sms = textHref(phone);
  const access = c.portalAccount ? portalAccess(c.portalAccount, c.active) : null;
  const trades = cleanTrades(c.trades);
  const w9OnFile = docOnFile(c.comments, "W-9");
  const coiOnFile = docOnFile(c.comments, "Insurance");

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
  // Buffalo's calendar day, not the server's (UTC on Vercel rolls over at 8pm).
  const today = todayYmdEastern();

  return (
    // A record: capped at 1200, with a 320 rail beside the jobs once the page
    // is wide enough (docs/brand-guidelines.md, section 5). The rail comes
    // first in the markup, so a phone shows how to reach them before the jobs.
    <div className="@container max-w-300">
      <BackLink fallback="/contractors" label="Contractors" />
      <div className="mt-2 mb-6">
        <h1 className="text-title text-balance text-fg-1">{c.fullName}</h1>
        {(c.company || c.tenantFixes) && (
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {c.company && <p className="min-w-0 truncate text-meta text-fg-3">{c.company}</p>}
            {c.tenantFixes && <Badge className="shrink-0">Tenant fixes</Badge>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 pointer-coarse:gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:gap-10">
        <aside className="min-w-0 space-y-8 pointer-coarse:space-y-6 @4xl:col-start-2 @4xl:row-start-1">
          <Section title="Contact">
            <dl>
              <Detail label="Trades">{trades}</Detail>
              <Detail label="Phone">
                {c.phone ? (
                  <>
                    <ContactLink href={telHref(phone)} className="num">
                      {c.phone}
                    </ContactLink>
                    {/* Touch only, where a tap opens Messages (ADMIN-004). The ::after reaches 44px. */}
                    {sms && (
                      <ContactLink
                        href={sms}
                        aria-label={`Text ${firstName(c.fullName) || c.fullName}`}
                        className="relative ml-3 after:absolute after:-inset-x-2.5 after:-inset-y-3.5 pointer-fine:hidden"
                      >
                        Text
                      </ContactLink>
                    )}
                  </>
                ) : null}
              </Detail>
              <Detail label="Email">
                {c.email ? <ContactLink href={mailtoHref(c.email)}>{c.email}</ContactLink> : null}
              </Detail>
              <Detail label="Mailing address">
                {c.mailingAddress ? (
                  <ContactLink href={mapsHref(c.mailingAddress)} newTab>
                    {c.mailingAddress}
                  </ContactLink>
                ) : null}
              </Detail>
              <Detail label="Billing">{c.billingInfo}</Detail>
              <Detail label="Availability">{c.availability}</Detail>
              <Detail label="W-9">{c.w9Url ? <DocLink href={c.w9Url} /> : w9OnFile ? "On file" : null}</Detail>
              <Detail label="Insurance (COI)">{c.coiUrl ? <DocLink href={c.coiUrl} /> : coiOnFile ? "On file" : null}</Detail>
            </dl>
            {c.comments && (
              <p className="whitespace-pre-wrap border-t border-line pt-3 text-meta text-fg-3">{c.comments}</p>
            )}
          </Section>

          <PortalAccessCard
            contactId={c.id}
            contactName={c.fullName}
            defaultEmail={c.email}
            phone={phone}
            staffName={me.name ?? me.email}
            appUrl={await signInOrigin()}
            account={
              c.portalAccount && access
                ? {
                    id: c.portalAccount.id,
                    email: c.portalAccount.email,
                    state: access.state,
                    line: access.line,
                    restorable: c.portalAccount.status !== "ACTIVE",
                    contactActive: c.active,
                  }
                : null
            }
          />
        </aside>

        <Section
          className="min-w-0 @4xl:col-start-1 @4xl:row-start-1"
          title={
            <>
              Jobs
              {jobCount > 0 && <span className="num ml-1.5 font-normal text-fg-3">{jobCount}</span>}
            </>
          }
        >
          {tasks.length === 0 ? (
            <p className="text-body text-fg-3">No jobs assigned yet.</p>
          ) : (
            // Status as a mark and a word in one fixed column, then the job and
            // its place, then the date (section 9). Below 480 the row keeps two
            // lines: the mark leads, and the word and date move into the subline.
            <ul className="@container divide-y divide-line">
              {tasks.map((t) => {
                const closed = !isActiveStatus(t.status);
                // Their jobs show the Target (D7): the visit date while
                // Scheduled, otherwise Due. A closed job shows the day it closed.
                const dates = { status: t.status, scheduledFor: toYmd(t.scheduledFor), due: toYmd(t.dueDate) };
                const late = !closed && isTargetLate(dates, today);
                // completedAt is an instant: the Buffalo day it fell on.
                const day = closed ? (t.completedAt ? todayYmdEastern(t.completedAt) : null) : targetOf(dates);
                // Late shows the real date in --danger (section 3).
                const date = day ? (late ? fmtDay(day, { year: "auto", now: today }) : dayLabel(day, today)) : null;
                return (
                  <li
                    key={t.id}
                    className="relative grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 py-2.5 transition-colors hover:bg-fill-1 pointer-coarse:py-3 @min-[30rem]:grid-cols-[7rem_minmax(0,1fr)_6rem] @min-[30rem]:items-center"
                  >
                    {/* The whole row opens the job, as TaskRow does; the place's link sits above it. */}
                    <Link href={`/tasks/${t.id}`} className="absolute inset-0 -outline-offset-2">
                      <span className="sr-only">{t.title}</span>
                    </Link>
                    <span className="flex h-5 items-center pointer-coarse:h-5.5">
                      <StatusMark status={t.status} className="@min-[30rem]:hidden" />
                      <StatusBadge status={t.status} className="hidden @min-[30rem]:inline-flex" />
                    </span>
                    <div className="min-w-0">
                      <p aria-hidden="true" className={cn("truncate text-body", closed ? "text-fg-3 line-through" : "text-fg-1")}>
                        {t.title}
                      </p>
                      {/* Always there on a narrow row, where it carries the status word; a wide row shows it only for a place. */}
                      <p className={cn("truncate text-meta text-fg-3", !t.property && "@min-[30rem]:hidden")}>
                        <span className={cn("@min-[30rem]:hidden", STATUS_TONE[t.status])}>{STATUS_LABEL[t.status]}</span>
                        {t.property && (
                          <>
                            <span className="@min-[30rem]:hidden"> · </span>
                            {/* With a mouse the place opens the property; on touch the whole row opens the job. */}
                            <Link
                              href={`/properties/${t.property.id}`}
                              className="relative hover:text-fg-1 hover:underline pointer-coarse:pointer-events-none"
                            >
                              {shortAddress(t.property.address)}
                            </Link>
                          </>
                        )}
                        {date && (
                          <span className={cn("num @min-[30rem]:hidden", late && "text-danger")}> · {date}</span>
                        )}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "num hidden text-right text-meta @min-[30rem]:block",
                        late ? "text-danger" : "text-fg-2",
                      )}
                    >
                      {date ?? <span className="text-fg-3">—</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
