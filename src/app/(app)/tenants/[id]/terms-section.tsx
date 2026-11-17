"use client";
import { UploadStatusLine, isGoingUp, useMediaUploader } from "@/components/media-uploader";
import { Money } from "@/components/money";
import { railVerbClass } from "@/components/rail";
import { Spinner } from "@/components/spinner";
import { Button, Section } from "@/components/ui";
import type { UploadTarget } from "@/components/upload-queue";
import { UPLOAD_KIND_ALLOWED, leaseDocParent, uploadTargetHref, uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { tenantShare } from "@/lib/tenants/fields";
import { recordLeaseFileAction } from "./actions";
import { termDates, useTermSheet, type EditTerm } from "./term-sheet";

export type TermRow = EditTerm & { file: { id: string; filename: string } | null };

/**
 * The Terms section: one row per signed term, newest first. The dates and
 * rent on one line, the split under it when a housing authority pays part,
 * and the signed lease at the right: its file, or a verb to add it. A row
 * opens its term to edit or delete, as a person's row opens their sheet
 * (docs/specs/lease-term-edits.md); the file stays its own control. Renew
 * adds the next term.
 */
export function TermsSection({ leaseId, terms }: { leaseId: string; terms: TermRow[] }) {
  const { open, edit } = useTermSheet();
  return (
    <Section
      title="Terms"
      actions={
        <Button variant="secondary" size="sm" onClick={open}>
          {terms.length ? "Renew" : "Add the signed lease"}
        </Button>
      }
    >
      {terms.length === 0 ? (
        <p className="text-meta text-muted-foreground">No signed lease yet.</p>
      ) : (
        <ul className="-mt-1">
          {terms.map((t) => (
            <li
              key={t.id}
              className="flex flex-col items-start border-b border-border last:border-0 max-sm:pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => edit(t)}
                className="-mx-2 my-0.5 flex min-h-12 max-w-[calc(100%+1rem)] min-w-0 flex-col items-start justify-center rounded-md px-2 py-1.5 text-left transition-colors pointer-fine:hover:bg-muted max-sm:self-stretch sm:flex-1"
              >
                <span className="text-body text-foreground">
                  <span className="num">{termDates(t)}</span>
                  <span className="text-muted-foreground"> · </span>
                  <Money value={t.rent} />
                </span>
                {t.subsidy ? (
                  <span className="max-w-full text-meta text-muted-foreground max-sm:truncate">
                    Tenant pays <Money value={tenantShare(t.rent, t.subsidy)} /> · Housing authority <Money value={t.subsidy} />
                  </span>
                ) : null}
              </button>
              <TermFile leaseId={leaseId} term={t} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * A term's signed lease: the file, opened in a new tab, with Replace; or
 * "Add the signed lease" when there's none. Through the upload queue, as a
 * contractor's W-9 is, so a file keeps going if you leave the page. A refusal
 * (a type it doesn't take, a file too big) shows under the row with Retry.
 */
function TermFile({ leaseId, term }: { leaseId: string; term: TermRow }) {
  const parentId = leaseDocParent(leaseId, term.id);
  const target: UploadTarget = {
    key: uploadTargetKey("lease-upload", parentId),
    label: "Signed lease",
    uploadKind: "lease-upload",
    parentId,
    access: "private",
    allowed: UPLOAD_KIND_ALLOWED["lease-upload"],
    prepare: "original",
    record: (file, owner) => recordLeaseFileAction(leaseId, term.id, file, owner),
    // A file that lands with this page gone is on the lease all the same.
    whenAway: "hold",
    href: uploadTargetHref("lease-upload", parentId),
  };
  const uploader = useMediaUploader({ target });
  const busy = uploader.uploads.some(isGoingUp);
  return (
    <div className="flex min-w-0 max-w-full flex-col items-start gap-1 sm:max-w-[45%] sm:items-end">
      {uploader.inputs}
      {busy ? (
        <span className="inline-flex items-center gap-2 text-meta text-fg-2">
          <Spinner />
          Adding
        </span>
      ) : term.file ? (
        <span className="flex min-w-0 max-w-full items-center gap-3 text-meta">
          <a
            href={`/api/files/lease/${term.file.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-fg-2 underline decoration-1 underline-offset-3 hover:text-foreground"
          >
            {term.file.filename}
          </a>
          <button type="button" onClick={uploader.chooseFiles} className={railVerbClass()}>
            Replace
          </button>
        </span>
      ) : (
        <button type="button" onClick={uploader.chooseFiles} className={`${railVerbClass()} text-meta`}>
          Add the signed lease
        </button>
      )}
      {uploader.failed > 0 && <UploadStatusLine uploader={uploader} className="justify-start" />}
    </div>
  );
}
