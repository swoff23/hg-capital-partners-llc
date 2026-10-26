"use client";
import { useRef } from "react";
import { Upload } from "lucide-react";
import { FilesList, type FileLink } from "@/components/files-list";
import { UploadStatusLine, useMediaUploader } from "@/components/media-uploader";
import { DropLabel, useDropTarget, type UploadTarget } from "@/components/upload-queue";
import { Button, Section } from "@/components/ui";
import { UPLOAD_KIND_ALLOWED, uploadTargetHref, uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { deletePropertyDocument, recordPropertyDocument, renamePropertyDocument } from "./document-actions";
import { Count } from "./record-ui";

/**
 * A property's Documents (docs/specs/uploads-photos.md 2.2 and 2.4), on the
 * upload queue: "Add files" in the section's header, files dropped or pasted
 * anywhere on the section (it lights up where they will land), rows that say
 * who added each file and when ("Connor · Oct 3"), progress, Retry and a
 * type check on each, and a confirm before anything is deleted. Files keep
 * going if you leave the page, and wait for a signal rather than fail.
 * Documents (PDF, DOCX, XLSX, CSV, TXT up to 50 MB) and photos (up to 25 MB)
 * are kept as they are: the originals, private.
 */
export function PropertyDocumentsSection({ propertyId, label, files }: { propertyId: string; label: string; files: FileLink[] }) {
  const target: UploadTarget = {
    key: uploadTargetKey("property-upload", propertyId),
    label,
    uploadKind: "property-upload",
    parentId: propertyId,
    access: "private",
    allowed: UPLOAD_KIND_ALLOWED["property-upload"],
    prepare: "original",
    record: (file) => recordPropertyDocument(propertyId, file),
    // A file that lands with this page gone is on the property all the same.
    whenAway: "hold",
    href: uploadTargetHref("property-upload", propertyId),
  };
  const uploader = useMediaUploader({ target });
  const zone = useRef<HTMLDivElement>(null);
  const drop = useDropTarget(target, zone, { label: "Drop to add to Documents" });
  const empty = files.length === 0 && uploader.uploads.length === 0;

  return (
    <Section
      title={
        <>
          Documents
          {files.length > 0 && <Count n={files.length} />}
        </>
      }
      actions={
        <Button type="button" size="sm" variant="secondary" onClick={uploader.chooseFiles}>
          <Upload className="size-4" aria-hidden="true" />
          Add files
        </Button>
      }
    >
      {/* The zone that lights up under a dragged file: it takes the drop state around its content, under the heading's rule. */}
      <div ref={zone} className="relative">
        {uploader.inputs}
        {empty ? (
          <p className="text-body text-fg-3">Add a lease, a policy or a loan statement.</p>
        ) : (
          <FilesList files={files} uploader={uploader} onDelete={deletePropertyDocument} onRename={renamePropertyDocument} />
        )}
        {/* Failed rows carry their own reason and Retry (and the shared line under two or more); a held file says why it waits. */}
        {uploader.failed === 0 && uploader.waiting > 0 && <UploadStatusLine uploader={uploader} className="mt-2 justify-start" />}
        <DropLabel state={drop} label="Drop to add to Documents" />
      </div>
    </Section>
  );
}
