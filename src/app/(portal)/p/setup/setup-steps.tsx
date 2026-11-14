"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ClipboardList, Landmark } from "lucide-react";
import { ActionBar, SubmitKeycap, actionBarButton } from "@/components/action-bar";
import { FilesList, type FileLink } from "@/components/files-list";
import { Meter } from "@/components/meter";
import { UploadStatusLine, useMediaUploader } from "@/components/media-uploader";
import { Monogram } from "@/components/monogram";
import { SegmentedControl } from "@/components/segmented-control";
import { SpotArt } from "@/components/spot-art";
import { TagsField } from "@/components/tags-field";
import { Button, FormField, Input, LinkButton, TextLink } from "@/components/ui";
import type { UploadTarget } from "@/components/upload-queue";
import { callAction, type ActionResult, type FieldErrors } from "@/lib/action-result";
import { portalScope } from "@/lib/attachments/queue-owner";
import { UPLOAD_KIND_ALLOWED, contactDocParent, uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { BRAND } from "@/lib/brand";
import { SETUP_STEPS, SETUP_STEP_NAME, SETUP_TOTAL, setupStepNumber, type SetupStep } from "@/lib/contractors/onboarding";
import { cn } from "@/lib/utils";
import { signOutPortal } from "../actions";
import { recordSetupDocumentAction, removeSetupDocumentAction, saveDetailsAction, saveInsuranceAction, saveTradesAction, saveW9Action } from "./actions";

export type SetupInitial = {
  fullName: string;
  company: string;
  phone: string;
  mailingAddress: string;
  tradeIds: string[];
  tradesNote: string;
  /** Null until they've answered: nothing is picked for someone who hasn't saved the Trades step. */
  tenantFixes: boolean | null;
  noInsurance: boolean;
};

type Place = SetupStep | "done";
const ORDER: readonly Place[] = [...SETUP_STEPS, "done"];

const BLANK_W9 = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";
const quietLink = "inline-flex min-h-11 items-center rounded-sm text-label text-fg-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

const headings: Record<SetupStep, string> = {
  details: "Check your details",
  trades: "What work do you take on?",
  w9: "Add your signed W-9",
  insurance: "Add your business insurance",
};

/**
 * The contractor's setup, one step at a time like the move-in report (docs/specs/contractor-onboarding.md,
 * section 3.2): a Meter ("W-9 · 4 of 6"), the step's heading, and the docked bar with Back (from the second step
 * shown on) and Next. Each Next saves that step on the server, so staff see progress and a contractor can switch
 * phones halfway. A refusal shows on its field.
 */
export function SetupSteps({
  contactId,
  firstName,
  start,
  initial,
  trades,
  openSteps,
  setupDone,
  w9,
  insurance,
}: {
  contactId: string;
  firstName: string;
  start: Place;
  initial: SetupInitial;
  trades: { id: string; name: string }[];
  /** The steps not done yet when the page loaded. */
  openSteps: SetupStep[];
  /** They finished setup before: their files stay (staff keep what was sent) and the steps are for updating. */
  setupDone: boolean;
  w9: FileLink[];
  insurance: FileLink[];
}) {
  const [place, setPlace] = useState<Place>(start);
  const first = ORDER.indexOf(start);
  const at = ORDER.indexOf(place);
  const [saving, startSave] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [completed, setCompleted] = useState<Set<SetupStep>>(() => new Set(SETUP_STEPS.filter((s) => !openSteps.includes(s))));
  // Setup is required (Connor, Nov 14): until it's done, the way out is Sign out, not My jobs.
  const [finished, setFinished] = useState(setupDone);

  const [details, setDetails] = useState({ fullName: initial.fullName, company: initial.company, phone: initial.phone, mailingAddress: initial.mailingAddress });
  const [work, setWork] = useState({ tradeIds: initial.tradeIds, note: initial.tradesNote, tenantFixes: initial.tenantFixes });
  const [noInsurance, setNoInsurance] = useState(initial.noInsurance);

  const region = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // A new step starts at its heading, which a screen reader reads out.
  const arrived = useRef(false);
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [place]);

  const number = place === "done" ? SETUP_TOTAL : setupStepNumber(place);
  const stepLine = `${place === "done" ? "All set" : SETUP_STEP_NAME[place]} · ${number} of ${SETUP_TOTAL}`;

  function focusFirstLine() {
    requestAnimationFrame(() => {
      const el = region.current?.querySelector<HTMLElement>('[data-invalid="true"] button, [aria-invalid="true"]');
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center" });
    });
  }

  function go(to: Place) {
    setErrors({});
    setRefusal(null);
    setPlace(to);
  }

  function after(step: SetupStep, done: boolean) {
    if (done) setFinished(true);
    const next = new Set(completed).add(step);
    setCompleted(next);
    if (step !== "insurance") return go(ORDER[ORDER.indexOf(step) + 1]);
    // Insurance is the last saved step: All set once the required ones are in, else back to the first one that isn't.
    const missing = (["details", "trades", "w9"] as const).find((s) => !next.has(s));
    go(done || !missing ? "done" : missing);
  }

  function save(step: SetupStep, run: () => Promise<ActionResult<{ done: boolean }>>) {
    if (saving) return;
    startSave(async () => {
      // A dropped connection rejects the call; callAction turns it into a line instead of the error screen.
      const result = await callAction(run);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setRefusal(result.fieldErrors ? null : result.error);
        if (result.fieldErrors) focusFirstLine();
        return;
      }
      after(step, result.data.done);
    });
  }

  function next() {
    if (place === "done" || saving || uploading > 0) return;
    if (place === "details") return save(place, () => saveDetailsAction(details));
    if (place === "trades") return save(place, () => saveTradesAction({ tradeIds: work.tradeIds, note: work.note, tenantFixes: work.tenantFixes }));
    if (place === "w9") return save(place, () => saveW9Action());
    return save(place, () => saveInsuranceAction({ noInsurance: noInsurance && insurance.length === 0 }));
  }

  function noPolicy() {
    if (saving) return;
    setNoInsurance(true);
    startSave(async () => {
      const result = await callAction(() => saveInsuranceAction({ noInsurance: true }));
      if (!result.ok) {
        setNoInsurance(false);
        setRefusal(result.error);
        return;
      }
      after("insurance", result.data.done);
    });
  }

  return (
    <>
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto flex h-14 max-w-400 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <span className="flex shrink-0 items-center gap-2 text-label font-semibold text-foreground">
            <Monogram size={32} />
            {BRAND.portal}
          </span>
          {place !== "done" &&
            (finished ? (
              <Link href="/p" className={quietLink}>
                My jobs
              </Link>
            ) : (
              // Answers are saved step by step, so signing out loses nothing; the next sign-in opens the steps again.
              <form action={signOutPortal}>
                <button type="submit" className={quietLink}>
                  Sign out
                </button>
              </form>
            ))}
        </div>
      </header>

      <main ref={region} className="mx-auto max-w-2xl px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8">
        <Meter value={number} max={SETUP_TOTAL} label="Setup progress" valueText={stepLine} spring />
        <p className="mt-2 text-meta text-muted-foreground">{stepLine}</p>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          className="mt-6 space-y-6 text-left"
        >
          {place !== "done" && (
            <h1 ref={heading} tabIndex={-1} className="text-title text-balance text-foreground outline-none">
              {headings[place]}
            </h1>
          )}

          {place === "details" && (
            <div className="space-y-4">
              <FormField label="Name" required error={errors.fullName}>
                {(p) => <Input {...p} name="fullName" autoComplete="name" value={details.fullName} onChange={(e) => setDetails((d) => ({ ...d, fullName: e.target.value }))} />}
              </FormField>
              <FormField label="Company" optional error={errors.company}>
                {(p) => <Input {...p} name="company" autoComplete="organization" value={details.company} onChange={(e) => setDetails((d) => ({ ...d, company: e.target.value }))} />}
              </FormField>
              <FormField label="Mobile" required error={errors.phone}>
                {(p) => (
                  <Input
                    {...p}
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={details.phone}
                    onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
                  />
                )}
              </FormField>
              <FormField label="Mailing address" required helper="Street, city, state and ZIP." error={errors.mailingAddress}>
                {(p) => (
                  <Input
                    {...p}
                    name="mailingAddress"
                    autoComplete="street-address"
                    value={details.mailingAddress}
                    onChange={(e) => setDetails((d) => ({ ...d, mailingAddress: e.target.value }))}
                  />
                )}
              </FormField>
            </div>
          )}

          {place === "trades" && <TradesStep trades={trades} work={work} setWork={setWork} errors={errors} />}

          {(place === "w9" || place === "insurance") && (
            <DocumentsStep
              key={place}
              kind={place === "w9" ? "w9" : "insurance"}
              contactId={contactId}
              files={place === "w9" ? w9 : insurance}
              canRemove={!setupDone}
              signOutHint={!finished}
              onPendingChange={setUploading}
              noPolicy={place === "insurance" && insurance.length === 0 ? { chosen: noInsurance, choose: noPolicy, busy: saving } : null}
            />
          )}

          {place === "done" && <AllSet heading={heading} firstName={firstName} />}
        </form>
      </main>

      {place !== "done" && (
        <ActionBar
          contentClassName="max-w-2xl"
          onPrimary={next}
          secondary={
            at > first && (
              <Button type="button" variant="secondary" className={cn(actionBarButton, "shrink-0")} onClick={() => go(ORDER[at - 1])} disabled={saving}>
                Back
              </Button>
            )
          }
          primary={
            <Button type="button" className={actionBarButton} pending={saving} disabled={uploading > 0} onClick={next} aria-keyshortcuts="Meta+Enter Control+Enter">
              Next <SubmitKeycap />
            </Button>
          }
          error={refusal ? <p role="alert" className="truncate text-center text-meta text-destructive lg:text-right">{refusal}</p> : undefined}
        />
      )}
    </>
  );
}

/* ---------------- Trades ---------------- */

const YES_NO = [
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
] as const;

function TradesStep({
  trades,
  work,
  setWork,
  errors,
}: {
  trades: { id: string; name: string }[];
  work: { tradeIds: string[]; note: string; tenantFixes: boolean | null };
  setWork: React.Dispatch<React.SetStateAction<{ tradeIds: string[]; note: string; tenantFixes: boolean | null }>>;
  errors: FieldErrors;
}) {
  const nameOf = new Map(trades.map((t) => [t.id, t.name]));
  const idOf = new Map(trades.map((t) => [t.name.toLowerCase(), t.id]));
  const picked = work.tradeIds.map((id) => nameOf.get(id)).filter((n): n is string => !!n);
  return (
    <div className="space-y-5">
      <TagsField
        label="Trades"
        options={trades.map((t) => t.name)}
        value={picked}
        placeholder="Pick your trades"
        onChange={(names) => setWork((w) => ({ ...w, tradeIds: names.map((n) => idOf.get(n.toLowerCase())).filter((id): id is string => !!id) }))}
        isInvalid={!!errors.trades}
        errorMessage={errors.trades}
      />
      <FormField label="Anything we didn't list?" optional>
        {(p) => <Input {...p} name="note" maxLength={200} autoComplete="off" value={work.note} onChange={(e) => setWork((w) => ({ ...w, note: e.target.value }))} />}
      </FormField>
      <div data-invalid={errors.tenantFixes ? "true" : undefined} className="space-y-2">
        {/* Below 640 the control sits under the question, from 640 beside it, as the move-in report's ratings. */}
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span id="tenant-fixes" className="text-body text-foreground">
            Are you OK with fixing maintenance issues our tenants have?
          </span>
          <SegmentedControl
            aria-label="Fixing maintenance issues our tenants have"
            options={YES_NO}
            size="md"
            fullWidth="below-sm"
            value={work.tenantFixes === null ? null : work.tenantFixes ? "yes" : "no"}
            onChange={(key) => setWork((w) => ({ ...w, tenantFixes: key === "yes" }))}
          />
        </div>
        {errors.tenantFixes && <p className="truncate text-meta text-destructive">{errors.tenantFixes}</p>}
      </div>
    </div>
  );
}

/* ---------------- W-9 and insurance ---------------- */

function DocumentsStep({
  kind,
  contactId,
  files,
  canRemove,
  signOutHint,
  onPendingChange,
  noPolicy,
}: {
  kind: "w9" | "insurance";
  contactId: string;
  files: FileLink[];
  canRemove: boolean;
  /** Mid-setup: someone without a W-9 handy can stop here and come back. */
  signOutHint: boolean;
  onPendingChange: (pending: number) => void;
  noPolicy: { chosen: boolean; choose: () => void; busy: boolean } | null;
}) {
  const router = useRouter();
  const parentId = contactDocParent(contactId, kind);
  const target: UploadTarget = {
    key: uploadTargetKey("portal-contact-upload", parentId),
    label: kind === "w9" ? "W-9" : "Insurance",
    uploadKind: "portal-contact-upload",
    parentId,
    access: "private",
    allowed: UPLOAD_KIND_ALLOWED["portal-contact-upload"],
    prepare: "original",
    record: (file, owner) => recordSetupDocumentAction(kind, file, owner ?? portalScope(contactId)),
    // The new file shows in the list above once the page has it.
    onRecorded: () => router.refresh(),
    whenAway: "hold",
  };
  const uploader = useMediaUploader({ target, onPendingChange });
  const empty = files.length === 0 && uploader.uploads.length === 0;

  return (
    <div className="space-y-4">
      {uploader.inputs}
      {!empty && (
        <FilesList
          files={files}
          uploader={uploader}
          link={false}
          menu
          byline
          onDelete={
            canRemove
              ? async (id) => {
                  const res = await removeSetupDocumentAction(id);
                  if (res.ok) router.refresh();
                  return res;
                }
              : undefined
          }
        />
      )}
      {uploader.failed === 0 && uploader.waiting > 0 && <UploadStatusLine uploader={uploader} className="justify-start" />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button type="button" variant="secondary" onClick={uploader.chooseFiles}>
          <Camera className="size-4" aria-hidden="true" />
          Take a photo or add a PDF
        </Button>
        {kind === "w9" && (
          <TextLink href={BLANK_W9} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-body">
            Get a blank W-9 from the IRS
          </TextLink>
        )}
      </div>
      {kind === "w9" && <p className="text-meta text-muted-foreground">Only HG Capital staff can see it.</p>}
      {kind === "w9" && signOutHint && files.length === 0 && (
        <p className="text-meta text-muted-foreground">No W-9 handy? Sign out and come back. Your answers are saved.</p>
      )}
      {noPolicy &&
        (noPolicy.chosen ? (
          <p className="text-meta text-muted-foreground">You said you don&apos;t carry business insurance.</p>
        ) : (
          <div>
            <Button type="button" variant="ghost" disabled={noPolicy.busy || uploader.uploads.length > 0} onClick={noPolicy.choose}>
              I don&apos;t carry business insurance
            </Button>
          </div>
        ))}
    </div>
  );
}

/* ---------------- All set ---------------- */

function AllSet({ heading, firstName }: { heading: React.RefObject<HTMLHeadingElement | null>; firstName: string }) {
  return (
    <div role="status" className="flex flex-col items-start gap-5">
      <SpotArt name="job-done" />
      <h1 ref={heading} tabIndex={-1} className="text-title text-balance text-foreground outline-none">
        {firstName ? `Thanks, ${firstName}!` : "Thanks!"}
      </h1>
      <ul className="w-full divide-y divide-border border-y border-border">
        <li className="flex items-start gap-3 py-3">
          <Landmark className="mt-0.5 size-5 shrink-0 stroke-[1.5] text-fg-2" aria-hidden="true" />
          <span className="text-body text-foreground">If we don&apos;t have your bank details yet, Baselane will email you a link to add them.</span>
        </li>
        <li className="flex items-start gap-3 py-3">
          <ClipboardList className="mt-0.5 size-5 shrink-0 stroke-[1.5] text-fg-2" aria-hidden="true" />
          <span className="text-body text-foreground">Your jobs from HG Capital show up here.</span>
        </li>
      </ul>
      <LinkButton href="/p" variant="primary" className="h-12 w-full pointer-fine:h-9 sm:w-60">
        See my jobs
      </LinkButton>
    </div>
  );
}
