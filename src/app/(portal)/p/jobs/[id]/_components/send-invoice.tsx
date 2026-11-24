"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActionBar, actionBarButton } from "@/components/action-bar";
import { useHoldLeave, useLeaveGuard } from "@/components/leave-guard";
import { MediaUploadTray, UploadStatusLine, UploadTile, isGoingUp, useMediaUploader, type MediaUpload } from "@/components/media-uploader";
import { PhotoThumb } from "@/components/photo-thumb";
import { Sheet } from "@/components/sheet";
import { SpotArt } from "@/components/spot-art";
import { Button, FormField, Input, LinkButton } from "@/components/ui";
import { useUploadScope, type UploadTarget } from "@/components/upload-queue";
import { callAction } from "@/lib/action-result";
import { documentLook } from "@/lib/attachments/media";
import { UPLOAD_KIND_ALLOWED, uploadTargetHref, uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { invoiceSendParent } from "@/lib/attachments/limits";
import type { Ymd } from "@/lib/dates";
import { readTotal } from "@/lib/invoices/fields";
import { joinNames, payoffLine, sendInvoiceButton, stillUploading } from "@/lib/portal/job-view";
import { withNext } from "@/lib/portal/next-path";
import { cn } from "@/lib/utils";
import { InvoiceLine } from "../../../_components/invoice-list";
import { recordInvoiceFileAction, sendInvoiceAction, type SentInvoice } from "../invoice-actions";

/**
 * Send invoice (docs/contractor-invoices-plan.md, 4.1; drawings 06 and 09, B1): the button that takes the place of the
 * disabled "In review" in the job page's bottom bar, and the sheet it opens, which is Mark done's. The files go up
 * through the shared uploader as a `portal-invoice-upload` target, one way to add a file ("Add file"), and wait in the
 * contractor's own folder on the job until Send records them on the new invoice. Invoice # and Total are optional
 * and side by side. Send invoice stays off until a file is up, and the line under it says why (adding the file, or
 * "Finishing 1 upload…"; a failed or held file is the tray's Retry line). Leaving while a file goes up asks first.
 *
 * Sent, the same sheet turns into the payoff (brand guidelines, section 9): the building's photo or the job-done art,
 * "Thanks, Zack!", the invoice as it now shows on the job (Received), who heard and what happens next, and "Back to
 * my jobs". A file the sheet holds survives closing it; only a send, or removing it, clears it.
 *
 * A one-job link session (M16) can't send: its Send invoice asks them to sign in, and the sign-in comes back to this
 * job with `?do=invoice`, which opens the sheet once.
 */

type Property = { label: string; photoUrl: string | null } | null;

type Props = {
  taskId: string;
  contactId: string;
  firstName: string;
  staffNames: string[];
  /** HG's changes email this contractor, so the payoff promises one when it's paid. */
  getsEmail: boolean;
  /** The building, for the payoff's photo and the upload's name. */
  property: Property;
  /** A link session isn't signed in: the button asks them to sign in. */
  signedIn: boolean;
  /** `?do=invoice` (after signing in from a job link): the sheet opens once as the page loads. It only asks; nothing is sent. */
  openOnLoad?: boolean;
  today: Ymd;
};

/** The bar's button, and whatever it opens. */
export function SendInvoice(props: Props) {
  return props.signedIn ? <SendInvoiceSheet {...props} /> : <SignInToSend taskId={props.taskId} />;
}

/** Done jobs have no bar otherwise: Send invoice gets it to itself (drawing 09, B1). */
export function SendInvoiceBar(props: Props) {
  return <ActionBar primary={<SendInvoice {...props} />} />;
}

const barButton = cn(actionBarButton, "max-[360px]:px-2");
// The sheet's pair: half each on a phone, sized to their labels from md, as Mark done's.
const sheetButton = "h-12 min-w-0 flex-1 whitespace-nowrap pointer-fine:h-9 max-[360px]:px-2 md:flex-none";

/** A session a job link started asks them to sign in first, then comes back here with the sheet open. */
function SignInToSend({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  // Signing in replaces this session, the uploads' owner, as Sign out does: it asks first while a file goes up.
  const guard = useLeaveGuard({ signOut: true });
  const href = withNext("/login", `/p/jobs/${encodeURIComponent(taskId)}?do=invoice`);
  return (
    <>
      <Button className={barButton} onClick={() => setOpen(true)}>
        Send invoice
      </Button>
      <Sheet
        isOpen={open}
        onOpenChange={setOpen}
        title="Send invoice"
        className="md:w-[28rem]"
        footer={
          <div className="flex md:justify-end">
            <LinkButton
              href={href}
              variant="primary"
              className="h-12 w-full pointer-fine:h-9 md:w-auto"
              onClick={(e) => {
                // A new tab or window leaves nothing behind.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                guard(() => {
                  window.location.href = href;
                });
              }}
            >
              Sign in
            </LinkButton>
          </div>
        }
      >
        <p className="p-4 text-body text-fg-2">{"Sign in so you can see when it's paid."}</p>
      </Sheet>
    </>
  );
}

function SendInvoiceSheet({ taskId, contactId, firstName, staffNames, getsEmail, property, openOnLoad = false, today }: Props) {
  const router = useRouter();
  const owner = useUploadScope();
  const asked = useSearchParams().get("do") === "invoice";
  const [open, setOpen] = useState(() => openOnLoad && asked);
  const [view, setView] = useState<"ask" | "sent">("ask");
  // Files that are up and checked, by path: what Send names. They wait in this contractor's folder on the job.
  const [staged, setStaged] = useState<{ pathname: string; filename: string }[]>([]);
  const [number, setNumber] = useState("");
  const [total, setTotal] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInvoice | null>(null);
  const [sending, startSending] = useTransition();

  const parent = invoiceSendParent(taskId, contactId);
  const target: UploadTarget = {
    key: uploadTargetKey("portal-invoice-upload", parent),
    label: property?.label ?? "this job",
    uploadKind: "portal-invoice-upload",
    parentId: parent,
    access: "private",
    allowed: UPLOAD_KIND_ALLOWED["portal-invoice-upload"],
    // A photo of the bill goes up upright and without GPS, as a job photo does; a PDF goes as it is.
    prepare: "display",
    // The invoice doesn't exist until Send: the record step only checks the file is where Send will find it, and the
    // sheet keeps its path.
    record: async (file, who) => {
      const res = await recordInvoiceFileAction(taskId, file, who);
      if (res.ok) setStaged((f) => (f.some((x) => x.pathname === file.pathname) ? f : [...f, { pathname: file.pathname, filename: file.filename }]));
      return res;
    },
    // A file that lands with this page gone waits, as a draft with a way back to the job.
    whenAway: "hold",
    href: uploadTargetHref("portal-invoice-upload", parent),
  };
  const uploader = useMediaUploader({ target });
  const { pending, waiting, failed } = uploader;

  // Leaving the page while a file goes up asks first; the queue would finish it, but the sheet wouldn't be here to keep it.
  useHoldLeave(
    pending + waiting > 0
      ? { title: stillUploading(uploader.uploads.filter(isGoingUp).map((u) => u.kind)), stay: "Keep uploading" }
      : null,
  );

  // The address loses ?do=invoice once it has asked, so a reload or Back doesn't open the sheet again.
  useEffect(() => {
    if (!openOnLoad) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("do");
    window.history.replaceState(null, "", url);
  }, [openOnLoad]);

  const state = sendInvoiceButton({ pending, waiting, failed, sending, uploaded: staged.length });

  function send() {
    const read = readTotal(total);
    if (!read.ok) {
      setErrors({ total: read.message });
      return;
    }
    setErrors({});
    setError(null);
    startSending(async () => {
      const res = await callAction(() =>
        sendInvoiceAction(taskId, { invoiceNumber: number.trim() || null, total: total.trim() || null, files: staged }, owner),
      );
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        // A refusal that belongs to a field shows there, as its own line; anything else is the line above the buttons.
        setError(res.fieldErrors && Object.keys(res.fieldErrors).some((k) => k === "total" || k === "invoiceNumber") ? null : res.error);
        return;
      }
      setSent(res.data);
      setStaged([]);
      setNumber("");
      setTotal("");
      setView("sent");
      // The job page's Invoices section lists it behind the sheet.
      router.refresh();
    });
  }

  function onOpenChange(next: boolean) {
    if (!next && sending) return;
    setOpen(next);
  }

  // Each open from the bar is a fresh sheet, reset here and not on close, so the payoff stays put while the sheet
  // animates away (as Mark done's openMarkDone does).
  function openSheet() {
    setView("ask");
    setOpen(true);
  }

  return (
    <>
      <Button className={barButton} onClick={openSheet}>
        Send invoice
      </Button>
      {uploader.inputs}
      <Sheet
        isOpen={open}
        onOpenChange={onOpenChange}
        isDismissable={!sending}
        title={view === "sent" ? "Invoice sent" : "Send invoice"}
        hideTitle={view === "sent"}
        className="md:w-[28rem]"
        // Pinned under the files and fields, so on a short phone the primary and why it's off stay in view.
        footer={
          view === "ask" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 md:justify-end">
                <Button variant="secondary" className={sheetButton} disabled={sending} onClick={uploader.chooseFiles}>
                  Add file
                </Button>
                <Button className={sheetButton} disabled={!state.enabled} pending={state.busy} onClick={send}>
                  <span className="truncate">Send invoice</span>
                </Button>
              </div>
              {failed > 0 || (waiting > 0 && pending === 0) ? (
                <UploadStatusLine uploader={uploader} className="md:justify-end" />
              ) : error ? (
                <p className="truncate text-center text-meta text-destructive md:text-right">{error}</p>
              ) : state.line ? (
                <p className="truncate text-center text-meta text-muted-foreground md:text-right">{state.line}</p>
              ) : null}
            </div>
          )
        }
      >
        {view === "ask" ? (
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <p className="text-body font-medium text-foreground">Files</p>
              <MediaUploadTray
                uploader={uploader}
                layout="row"
                notice={false}
                label="Invoice files"
                disabled={sending}
                leading={staged.length > 0 ? staged.map((f) => <UploadTile key={f.pathname} upload={stagedUpload(f)} grid={false} ready onRemove={sending ? undefined : () => setStaged((s) => s.filter((x) => x.pathname !== f.pathname))} />) : undefined}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Invoice #" optional error={errors.invoiceNumber}>
                {(p) => (
                  <Input
                    {...p}
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    autoComplete="off"
                    enterKeyHint="next"
                    maxLength={200}
                    disabled={sending}
                  />
                )}
              </FormField>
              <FormField label="Total" optional error={errors.total}>
                {(p) => (
                  <Input
                    {...p}
                    prefix="$"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="done"
                    disabled={sending}
                  />
                )}
              </FormField>
            </div>
          </div>
        ) : (
          sent && <Sent firstName={firstName} staffNames={staffNames} getsEmail={getsEmail} property={property} invoice={sent} today={today} />
        )}
      </Sheet>
    </>
  );
}

/** A staged file as the tray's ready tile: its type over a glyph, since the bytes sit in private storage with no preview. */
function stagedUpload(f: { pathname: string; filename: string }): MediaUpload {
  const photo = documentLook(f.filename).glyph === "image";
  return { key: f.pathname, name: f.filename, kind: photo ? "image" : "file", previewUrl: null, progress: 1, status: "saving" };
}

/**
 * After Send invoice (docs/brand-guidelines.md, section 9 Empty and payoff states; the Mark done payoff's pieces): the
 * building's photo (the job-done line art until it has one), a warm heading, the invoice as the job lists it now, who
 * it went to and what happens next, then the way back to the next job. The row opens nothing, so the payoff stays
 * one layer and one Esc closes it.
 */
function Sent({
  firstName,
  staffNames,
  getsEmail,
  property,
  invoice,
  today,
}: {
  firstName: string;
  staffNames: string[];
  getsEmail: boolean;
  property: Property;
  invoice: SentInvoice;
  today: Ymd;
}) {
  const to = joinNames(staffNames) || "HG Capital";
  // The button that opened this view is gone: move focus here, so it's read out and Esc still closes the sheet.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // Through the portal layout's LeaveGuard, like "My jobs": it asks first if anything is still going up.
  const guard = useLeaveGuard();
  const router = useRouter();
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
      {property?.photoUrl ? (
        <PhotoThumb size="full" src={property.photoUrl} alt={`Front of ${property.label}`} className="w-full max-w-xs motion-safe:animate-pop-in" />
      ) : (
        <SpotArt name="job-done" className="motion-safe:animate-pop-in" />
      )}
      <h2 ref={heading} tabIndex={-1} className="mt-4 text-title text-balance text-foreground outline-none">
        Thanks, {firstName}!
      </h2>
      <div className="mt-3 w-full rounded-md border border-border px-3 text-left">
        <InvoiceLine invoice={{ ...invoice, jobs: [] }} today={today} showJob={false} />
      </div>
      <p className="mt-3 max-w-xs text-pretty text-body text-fg-2">{payoffLine(to, getsEmail, "invoice")}</p>
      <LinkButton
        href="/p"
        variant="primary"
        className="mt-6 h-12 w-full"
        onClick={(e) => {
          // A new tab or window leaves nothing behind.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          guard(() => router.push("/p"));
        }}
      >
        Back to my jobs
      </LinkButton>
    </div>
  );
}
