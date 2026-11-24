"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ExternalLink, FileImage, FileText } from "lucide-react";
import { LazyLightbox } from "@/components/lightbox-lazy";
import type { MediaItem, MediaUrlFor } from "@/components/lightbox";
import { UploadStatusLine, isGoingUp, useMediaUploader } from "@/components/media-uploader";
import { SegmentedControl } from "@/components/segmented-control";
import { DropLabel, useDropTarget, type UploadTarget } from "@/components/upload-queue";
import { AddRow, LinkButton, Button } from "@/components/ui";
import { Spinner } from "@/components/spinner";
import { documentLook } from "@/lib/attachments/media";
import { UPLOAD_KIND_ALLOWED, uploadTargetHref, uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { fmtDay } from "@/lib/dates";
import type { InvoiceFileRow, InvoiceRecord } from "@/lib/invoices/queries";
import { firstName } from "@/lib/names";
import { cn, formatBytes } from "@/lib/utils";
import { recordInvoiceFileAction } from "./actions";
import { linkParts, senderName } from "./email-text";

/**
 * The invoice's file, and the email it came in (docs/contractor-invoices-plan.md, section 6, item 2; drawings 03
 * and 13). On a computer with a mouse, from lg: the PDF in a frame that stays in view beside the fields, or a photo
 * that opens in the viewer. On touch and below lg: a file card with Open, one per file. With no file the email's
 * card takes the file's place. In To review, "Add the invoice file" sits under it, and a file dropped on the page
 * lands there too; after Approve the files are read-only.
 */

const fileUrl = (id: string, variant?: "thumb" | "poster") => `/api/files/invoice/${id}${variant === "thumb" ? "?v=thumb" : ""}`;
const urlFor: MediaUrlFor = (item, variant) => fileUrl(item.id, variant);

const isImage = (f: InvoiceFileRow) => !!f.contentType?.startsWith("image/") || documentLook(f.filename).glyph === "image";

export function invoiceUploadTarget(invoiceId: string, label: string): UploadTarget {
  return {
    key: uploadTargetKey("invoice-upload", invoiceId),
    label,
    uploadKind: "invoice-upload",
    parentId: invoiceId,
    access: "private",
    allowed: UPLOAD_KIND_ALLOWED["invoice-upload"],
    prepare: "original",
    record: (file, owner) => recordInvoiceFileAction(invoiceId, file, owner),
    // A file that lands with this page gone is on the invoice all the same.
    whenAway: "hold",
    href: uploadTargetHref("invoice-upload", invoiceId),
  };
}

export function FilePane({
  invoiceId,
  title,
  files,
  email,
  contactName,
  editable,
}: {
  invoiceId: string;
  title: string;
  files: InvoiceFileRow[];
  email: InvoiceRecord["email"];
  contactName: string | null;
  editable: boolean;
}) {
  const target = invoiceUploadTarget(invoiceId, title);
  const uploader = useMediaUploader({ target });
  const box = useRef<HTMLDivElement>(null);
  const drop = useDropTarget(editable ? target : null, box, { label: "Drop to add the invoice file" });
  const busy = uploader.uploads.some(isGoingUp);

  const [pick, setPick] = useState<string | null>(null);
  const selected = files.find((f) => f.id === pick) ?? files[0] ?? null;
  const images = files.filter(isImage);
  const [viewing, setViewing] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const items: MediaItem[] = images.map((f) => ({
    id: f.id,
    kind: "IMAGE",
    filename: f.filename,
    hasThumb: f.hasThumb,
    size: f.size,
    uploadedBy: contactName,
    createdAt: f.createdAt,
  }));
  const openImage = (f: InvoiceFileRow) => setViewing({ open: true, index: Math.max(0, images.findIndex((i) => i.id === f.id)) });
  const owner = firstName(contactName);

  const nothing = files.length === 0;
  return (
    <div ref={box} className="relative flex min-w-0 flex-col gap-3 lg:pointer-fine:h-full">
      <DropLabel state={drop} label="Drop to add the invoice file" />
      {uploader.inputs}

      {nothing && email && <EmailCard email={email} contactName={contactName} />}

      {selected && (
        <>
          {files.length > 1 && (
            <SegmentedControl
              aria-label="Invoice file"
              className="max-lg:hidden pointer-coarse:hidden"
              value={selected.id}
              onChange={setPick}
              options={files.map((f, i) => ({ key: f.id, label: `File ${i + 1}`, ariaLabel: f.filename }))}
            />
          )}
          {/* A mouse from lg: the file in a frame that stays beside the fields. */}
          <div className="hidden min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted lg:pointer-fine:block">
            {isImage(selected) ? (
              <button type="button" onClick={() => openImage(selected)} aria-label={`Open ${selected.filename}`} className="flex size-full items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(selected.id, selected.hasThumb ? "thumb" : undefined)} alt={selected.filename} className="max-h-full max-w-full object-contain" />
              </button>
            ) : (
              <iframe src={fileUrl(selected.id)} title={selected.filename} className="size-full bg-background" />
            )}
          </div>
          {/* Touch, and below lg: a card per file. */}
          <ul className="space-y-2 lg:pointer-fine:hidden">
            {files.map((f) => (
              <li key={f.id}>
                <FileCard file={f} owner={owner} onOpenImage={() => openImage(f)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {editable && (
        <div className="shrink-0">
          {busy ? (
            <span className="inline-flex min-h-10 items-center gap-2 text-meta text-fg-2">
              <Spinner />
              Adding
            </span>
          ) : (
            <AddRow onClick={uploader.chooseFiles}>{nothing ? "Add the invoice file" : "Add another file"}</AddRow>
          )}
          {uploader.failed > 0 && <UploadStatusLine uploader={uploader} className="justify-start" />}
        </div>
      )}

      <LazyLightbox
        items={items}
        index={viewing.index}
        onIndexChange={(index) => setViewing((v) => ({ ...v, index }))}
        isOpen={viewing.open}
        onOpenChange={(open) => setViewing((v) => ({ ...v, open }))}
        urlFor={urlFor}
      />
    </div>
  );
}

/** One file as a card: its name over "PDF · 182 KB · Zack", and Open (a PDF in a new tab, a photo in the viewer). */
function FileCard({ file, owner, onOpenImage }: { file: InvoiceFileRow; owner: string; onOpenImage: () => void }) {
  const look = documentLook(file.filename);
  const image = isImage(file);
  const Glyph = image ? FileImage : FileText;
  const meta = [look.label, file.size ? formatBytes(file.size) : null, owner].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background p-3">
      <Glyph className="size-8 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-foreground">{file.filename}</p>
        <p className="truncate text-meta text-muted-foreground">{meta}</p>
      </div>
      {image ? (
        <Button type="button" variant="secondary" onClick={onOpenImage}>
          Open
        </Button>
      ) : (
        <LinkButton href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer" variant="secondary">
          <ExternalLink className="size-4" aria-hidden="true" />
          Open
        </LinkButton>
      )}
    </div>
  );
}

/**
 * "From the email Zack sent Nov 18" and its words, three lines with Show more; web links in it are links. A card
 * like a comment card, in `--background` on a `--border` edge: a muted fill would read as internal.
 */
export function EmailCard({
  email,
  contactName,
  className,
}: {
  email: NonNullable<InvoiceRecord["email"]>;
  contactName: string | null;
  className?: string;
}) {
  const who = firstName(contactName) || firstName(senderName(email.from)) || senderName(email.from) || "the sender";
  const text = (email.text ?? "").trim();
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const body = useRef<HTMLParagraphElement>(null);
  // Whether three lines hold it all: measured while clamped, since the open state has no overflow to measure.
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || open) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, text]);

  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-background p-3", className)}>
      <p className="text-meta font-medium text-fg-2">
        From the email {who} sent {fmtDay(email.receivedAt, { year: "auto" })}
      </p>
      {text && (
        <>
          <p ref={body} className={cn("mt-1.5 whitespace-pre-line break-words text-body text-foreground [overflow-wrap:anywhere]", !open && "line-clamp-3")}>
            {linkParts(text).map((p, i) =>
              p.type === "link" ? (
                <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-3 hover:decoration-2">
                  {p.text}
                </a>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
          {(overflows || open) && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="mt-1 rounded-sm text-meta font-medium text-foreground underline-offset-3 hover:underline pointer-coarse:min-h-11"
            >
              {open ? "Show less" : "Show more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
