"use client";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { UploadStatusLine, isGoingUp, useMediaUploader } from "@/components/media-uploader";
import { RailFact, railVerbClass } from "@/components/rail";
import { Spinner } from "@/components/spinner";
import { textLinkClass } from "@/components/ui";
import type { UploadTarget } from "@/components/upload-queue";
import { UPLOAD_KIND_ALLOWED, contactDocParent, uploadTargetHref, uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { recordContactDocumentAction } from "./document-actions";

/**
 * The W-9 and Insurance rows of a contractor's page, with a way for a partner to add the file (one that came by
 * email, say). Empty, the row is its verb ("Add W-9"), which opens the files, or the camera or files on a phone. With
 * a file, View opens it and Replace adds a newer one; older ones stay on record. The same upload queue as everywhere,
 * so a file keeps going if you leave the page. docs/specs/contractor-onboarding.md.
 */
export function ContactDocFact({
  contactId,
  kind,
  label,
  name,
  href,
  fallback,
  warn,
}: {
  contactId: string;
  kind: "w9" | "insurance";
  label: ReactNode;
  /** What the file is, for the queue's lines and the toast ("W-9", "Insurance"). */
  name: string;
  /** The file to open: the newest upload, else an old Drive link. */
  href: string | null;
  /** What shows with no file: "On file" (a name in the notes) or "No insurance". */
  fallback: string | null;
  /** A missing W-9 reads in --warn, as other missing key facts do. */
  warn?: boolean;
}) {
  const parentId = contactDocParent(contactId, kind);
  const target: UploadTarget = {
    key: uploadTargetKey("contact-upload", parentId),
    label: name,
    uploadKind: "contact-upload",
    parentId,
    access: "private",
    allowed: UPLOAD_KIND_ALLOWED["contact-upload"],
    prepare: "original",
    record: (file, owner) => recordContactDocumentAction(contactId, kind, file, owner),
    // A file that lands with this page gone is on the contractor all the same.
    whenAway: "hold",
    href: uploadTargetHref("contact-upload", parentId),
  };
  const uploader = useMediaUploader({ target });
  const busy = uploader.uploads.some(isGoingUp);

  const replace = (
    <button type="button" onClick={uploader.chooseFiles} className={railVerbClass()}>
      Replace
    </button>
  );
  let value: ReactNode = null;
  if (busy) {
    value = (
      <span className="inline-flex items-center gap-2 text-fg-2">
        <Spinner />
        Adding
      </span>
    );
  } else if (href) {
    value = (
      <>
        <a href={href} target="_blank" rel="noreferrer" className={textLinkClass}>
          View
          <ArrowUpRight className="ml-0.5 inline size-3.5 align-middle" aria-hidden="true" />
        </a>
        {replace}
      </>
    );
  } else if (fallback) {
    value = (
      <>
        <span>{fallback}</span>
        {replace}
      </>
    );
  }

  return (
    <>
      {uploader.inputs}
      <RailFact label={label} empty={`Add ${kind === "w9" ? "W-9" : "insurance"}`} onAdd={uploader.chooseFiles} tone={warn ? "warn" : undefined}>
        {value}
      </RailFact>
      {/* A refusal (a type it doesn't take, a file too big) says so under the row, with Retry. */}
      {uploader.failed > 0 && <UploadStatusLine uploader={uploader} className="justify-start pb-1" />}
    </>
  );
}
