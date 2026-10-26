"use client";
import { useState, useTransition } from "react";
import { Ellipsis, ExternalLink, FileText, Lock, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Button, buttonClass } from "@/components/ui";
import { callAction, type ActionResult } from "@/lib/action-result";
import { cn, formatBytes } from "@/lib/utils";

/** A document or a link on a record. Photos and videos go in MediaGrid instead. */
export type FileLink = {
  id: string;
  kind: "FILE" | "LINK";
  filename: string;
  /** The gated file route (/api/files/task/<id>, /api/files/property/<id>) for a file; the outside URL for a link. */
  href: string;
  size: number | null;
  internal: boolean;
  /** Who added it, a first name or a full name: "Connor". Null for an import whose uploader wasn't matched. */
  uploadedBy?: string | null;
  /** When it was added, for the byline's date. */
  createdAt?: Date | string;
};

/**
 * A record's documents and links (the task page, Activity, the contractor
 * job page, property Documents), each opening in a new tab. With `onDelete`
 * (staff), each row has a "…" menu with Delete, asked once more before it
 * goes. The "…" shows on hover or focus with a mouse, always on touch.
 *
 * The uploads spec's rows (2.4: type icons, the "Connor · Oct 3" byline from
 * `uploadedBy` and `createdAt`, Open, Download and Rename in the menu, rows
 * in flight and failed, the viewer at a desk) are UP1's. `byline` and `menu`
 * are part of the contract and not drawn yet.
 */
export function FilesList({
  files,
  className,
  onFill = false,
  onDelete,
  byline = true,
  menu = true,
}: {
  files: FileLink[];
  className?: string;
  /** On a --fill-1 ground (an internal comment), where that hover would vanish: rows hover in --fill-2. */
  onFill?: boolean;
  /** Removes a file for good; a server action can be passed as is. */
  onDelete?: (id: string) => Promise<ActionResult<unknown>>;
  /** Who added each file and when; off in Activity rows, where the comment already says. */
  byline?: boolean;
  /** The row's ⋯ menu; off in Activity rows. */
  menu?: boolean;
}) {
  void byline;
  void menu;
  const [target, setTarget] = useState<FileLink | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (files.length === 0) return null;

  const close = () => {
    if (pending) return;
    setTarget(null);
    setError("");
  };

  // One wrapper, so the confirm (fixed, out of flow) never counts as a sibling in the parent's spacing.
  // The list takes the ground it sits on (the page, or a comment card), so it
  // never nests a darker well inside a lighter card in dark.
  return (
    <div className={className}>
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
        {files.map((f) => {
          const Icon = f.kind === "LINK" ? ExternalLink : FileText;
          return (
            <li key={f.id} className="group/file flex items-center">
              <a
                href={f.href}
                target="_blank"
                rel="noreferrer"
                // The focus outline drawn inside, where the list's rounded clip can't cut it.
                className={cn(
                  "flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-3 text-body text-fg-1 transition-colors focus-visible:-outline-offset-2 pointer-coarse:min-h-11",
                  onFill ? "hover:bg-fill-2" : "hover:bg-fill-1",
                )}
              >
                <Icon className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                {f.internal && <Lock className="size-3.5 shrink-0 text-fg-3" aria-label="Internal" />}
                {f.kind === "FILE" && f.size ? <span className="shrink-0 text-meta tabular-nums text-fg-3">{formatBytes(f.size)}</span> : null}
              </a>
              {onDelete && (
                <MenuTrigger>
                  <AriaButton
                    aria-label={`More for ${f.filename}`}
                    className={cn(
                      buttonClass({ variant: "ghost", size: "sm", icon: true }),
                      "mr-1 text-fg-3 transition-[color,background-color,opacity] data-pressed:bg-fill-1",
                      // Shown on hover or focus with a mouse; always there on touch, which has no hover.
                      "aria-expanded:opacity-100 data-focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/file:opacity-100 pointer-fine:group-focus-within/file:opacity-100",
                    )}
                  >
                    <Ellipsis className="size-4" aria-hidden="true" />
                  </AriaButton>
                  <Menu>
                    <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => setTarget(f)}>
                      Delete
                    </MenuItem>
                  </Menu>
                </MenuTrigger>
              )}
            </li>
          );
        })}
      </ul>
      {target && onDelete && (
        <ConfirmDialog
          title={target.kind === "LINK" ? "Delete this link?" : "Delete this file?"}
          body={
            <>
              <span className="break-all">“{target.filename}”</span> goes for good.
              {error && <span className="mt-2 block text-danger">{error}</span>}
            </>
          }
          onClose={close}
          cancelLabel="Keep it"
          busy={pending}
          actions={
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError("");
                  const res = await callAction(() => onDelete(target.id));
                  if (res.ok) setTarget(null);
                  else setError(res.error);
                })
              }
            >
              {pending ? "Deleting…" : target.kind === "LINK" ? "Delete link" : "Delete file"}
            </Button>
          }
        />
      )}
    </div>
  );
}
