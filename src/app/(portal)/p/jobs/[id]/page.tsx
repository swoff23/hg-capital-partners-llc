import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoThumb } from "@/components/photo-thumb";
import { StatusBadge } from "@/components/status-badge";
import { Section } from "@/components/ui";
import { jobInvoicesForContractor } from "@/lib/invoices/queries";
import { todayYmdEastern } from "@/lib/dates";
import { contractorMaySetDate, jobLinkStep } from "@/lib/portal/job-link-paths";
import { addressLine, firstName, mayOfferSendInvoice, nextStep } from "@/lib/portal/job-view";
import { noteJobViewed } from "@/lib/portal/jobs";
import { getJob } from "@/lib/portal/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { isActiveStatus } from "@/lib/task-scope";
import { cn } from "@/lib/utils";
import { InvoiceList } from "../../_components/invoice-list";
import { CrewText } from "./_components/crew-text";
import { HashScroll } from "./_components/hash-scroll";
import { JobActions } from "./_components/job-actions";
import { JobHeader } from "./_components/job-header";
import { JobDate } from "./_components/job-date";
import { AddressActions, JobChecklist, LockboxSection, TenantsSection } from "./_components/job-details";
import { JobMediaSection } from "./_components/job-media";
import { JobNotice } from "./_components/job-notice";
import { JobUpdates } from "./_components/job-updates";
import { LateUploads } from "./_components/late-uploads";
import { SendInvoiceBar } from "./_components/send-invoice";

export const metadata: Metadata = { title: "Job" };

const firstValue = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * A contractor's job (docs/asana-migration-plan.md §6, D31: one scroll with a
 * bottom bar): the property's photo, status and title, address, what changed
 * since they last looked, tenants and lockbox (D21, docs/specs/tenants.md
 * section 8), notes (D16), checklist, photos and
 * videos, updates and the composer. Done and canceled jobs are read-only
 * (D18). Opening it marks everything seen.
 *
 * A record page (docs/brand-guidelines.md, section 5): capped at 1200 with
 * the 16 / 24 / 32 gutters, sections over hairlines. On a phone the photo
 * runs full width at 16:9 under the header, since whoever holds the phone is
 * often standing at the building; from sm it's the record header's 96x72
 * beside the title. Until HG's photos exist it's the fallback tile.
 *
 * Updates are the staff page's timeline (activity 3.4 A). The notice reads
 * where the contractor last looked before this visit is recorded, so it shows
 * once and clears on the next open.
 */
export default async function JobPage({ params, searchParams }: PageProps<"/p/jobs/[id]">) {
  const principal = await requirePortalPrincipal();
  const { id } = await params;
  // What an email's button asked the page to have ready (job-link-paths.ts).
  const ask = jobLinkStep(firstValue((await searchParams).do));
  const job = await getJob(principal, id);
  if (!job) notFound();
  // A one-job link session sees no invoice and can't send one (M16): the section is skipped and Send invoice asks them to sign in.
  const signedIn = !principal.onlyTaskId;
  const invoices = signedIn ? await jobInvoicesForContractor({ contactId: principal.contactId, onlyTaskId: principal.onlyTaskId }, job.id) : [];

  // Read state and the lockbox and tenants log, written after the page is sent.
  await noteJobViewed(job.id, { lockboxShown: !!job.lockbox, tenantShown: job.tenants.people.length > 0 });

  const now = new Date();
  const today = todayYmdEastern(now);
  const active = isActiveStatus(job.status);
  // A Done job has no next step, so Send invoice alone gets the bar (docs/contractor-invoices-plan.md, 4.1).
  const invoiceBarAlone = job.status === "DONE" && mayOfferSendInvoice(job.status);
  const hasBar = nextStep(job.status) !== null || invoiceBarAlone;
  const sendInvoice = { signedIn, openOnLoad: ask === "invoice" && signedIn && mayOfferSendInvoice(job.status), today };
  const photoAlt = job.address ? `Front of ${addressLine(job.address, null, { short: true })}` : null;
  // The building, for the upload's name and the payoff's photo.
  const place = job.address ? { label: addressLine(job.address, null, { short: true }), photoUrl: job.photoUrl } : null;

  // Leaving this page never cancels what's still going up: the portal layout's upload queue keeps it going and
  // posts it, and only Sign out asks.
  return (
    <>
      {/* Text to my crew, while the job is open (docs/specs/contractor-job-emails.md, section 4). */}
      <JobHeader actions={active && <CrewText taskId={job.id} openOnLoad={ask === "share"} />} />

      <main className={cn("mx-auto max-w-300", hasBar ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : "pb-12")}>
        <HashScroll />
        {photoAlt && <PhotoThumb size="full" src={job.photoUrl} alt={photoAlt} className="rounded-none sm:hidden" />}

        <div className="space-y-8 px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8 pointer-coarse:space-y-6">
          <div>
            <div className="flex items-start gap-4">
              {photoAlt && <PhotoThumb size={96} src={job.photoUrl} alt={photoAlt} className="max-sm:hidden" />}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge status={job.status} className="shrink-0" />
                  {active && (
                    <JobDate
                      taskId={job.id}
                      target={job.target}
                      isVisit={job.targetIsVisit}
                      today={today}
                      editable={contractorMaySetDate(job.status)}
                      openOnLoad={ask === "date"}
                    />
                  )}
                </div>
                <h1 className="mt-1 text-title text-balance break-words text-foreground">{job.title}</h1>
                {(job.address || job.unitLabel) && (
                  <p className="mt-1 text-meta text-muted-foreground">{addressLine(job.address, job.unitLabel)}</p>
                )}
              </div>
            </div>
            {job.address && <AddressActions address={job.address} />}
          </div>

          <JobNotice notice={job.notice} now={now.toISOString()} />

          {job.tenants.people.length > 0 && <TenantsSection tenants={job.tenants} />}

          {job.lockbox && (
            <LockboxSection taskId={job.id} lockbox={job.lockbox} permittedBy={job.tenants.permitted ? job.tenants.people.length : 0} />
          )}

          {job.notes && (
            <Section title="Notes">
              <p className="max-w-prose whitespace-pre-wrap break-words text-pretty text-body text-foreground">{job.notes}</p>
            </Section>
          )}

          {job.checklist.length > 0 && <JobChecklist items={job.checklist} editable={active} />}

          {invoices.length > 0 && (
            <Section title="Invoices">
              {/* The rows sit on hairlines; the heading's rule is the first one. */}
              <div className="-mt-3">
                <InvoiceList invoices={invoices} today={today} showJob={false} />
              </div>
            </Section>
          )}

          <JobMediaSection media={job.media} atFinish={job.atFinish} />

          <Section id="updates" title="Updates">
            <JobUpdates
              updates={job.updates}
              now={now.toISOString()}
              newSince={job.newSince}
              delivery={job.delivery}
              viewerName={principal.label}
            />
            {active ? (
              <JobActions
                taskId={job.id}
                contactId={principal.contactId}
                status={job.status}
                firstName={firstName(principal.label)}
                staffNames={job.staffNames}
                getsEmail={job.getsEmail}
                finishPhotosRequired={job.finishPhotosRequired}
                markedDoneAt={job.markedDoneAt}
                property={place}
                sentClientIds={job.updates.flatMap((u) => (u.clientId ? [u.clientId] : []))}
                openMarkDoneOnLoad={ask === "done"}
                sendInvoice={sendInvoice}
              />
            ) : (
              // An approved or canceled job has no composer, but photos queued before then can still be waiting to record.
              <LateUploads taskId={job.id} label={place?.label ?? "this job"} />
            )}
          </Section>
        </div>
      </main>

      {invoiceBarAlone && (
        <SendInvoiceBar
          taskId={job.id}
          contactId={principal.contactId}
          firstName={firstName(principal.label)}
          staffNames={job.staffNames}
          getsEmail={job.getsEmail}
          property={place}
          signedIn={signedIn}
          openOnLoad={sendInvoice.openOnLoad}
          today={today}
        />
      )}
    </>
  );
}
