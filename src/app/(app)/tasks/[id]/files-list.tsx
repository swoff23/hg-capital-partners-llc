"use client";
import { useState, useTransition } from "react";
import { Ellipsis, ExternalLink, FileText, Lock, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Button } from "@/components/ui";
import { callAction, type ActionResult } from "@/lib/action-result";
import { formatBytes } from "@/lib/utils";

/** A document or a link on a task. Photos and videos go in MediaGrid instead. */
export type FileLink = {
  id: string;
  kind: "FILE" | "LINK";
  filename: string;
  /** /api/files/task/<id> for a file; the outside URL for a link. */
  href: string;
  size: number | null;
  internal: boolean;
};

/**
 * The task's documents and links, each opening in a new tab. With `onDelete`
 * (staff), each row has a "…" menu with Delete, asked once more before it
 * goes. The "…" shows on hover or focus with a mouse, always on touch.
 */
export function FilesList({
  files,
  className,
  onDelete,
}: {
  files: FileLink[];
  className?: string;
  /** Removes a file for good; a server action can be passed as is. */
  onDelete?: (id: string) => Promise<ActionResult<unknown>>;
}) {
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
  return (
    <div className={className}>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {files.map((f) => {
          const Icon = f.kind === "LINK" ? ExternalLink : FileText;
          return (
            <li key={f.id} className="group/file flex items-center">
              <a
                href={f.href}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-3 text-sm outline-none transition-colors hover:bg-background focus-visible:bg-background pointer-coarse:min-h-11"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                {f.internal && <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Internal" />}
                {f.kind === "FILE" && f.size ? <span className="shrink-0 text-xs tabular-nums text-muted">{formatBytes(f.size)}</span> : null}
              </a>
              {onDelete && (
                <MenuTrigger>
                  <AriaButton
                    aria-label={`More for ${f.filename}`}
                    className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-[color,background-color,opacity] hover:bg-background hover:text-foreground aria-expanded:opacity-100 data-focus-visible:opacity-100 data-focus-visible:ring-2 data-focus-visible:ring-primary/30 pointer-coarse:h-11 pointer-coarse:w-11 pointer-fine:opacity-0 pointer-fine:group-hover/file:opacity-100 pointer-fine:group-focus-within/file:opacity-100"
                  >
                    <Ellipsis className="h-4 w-4" aria-hidden="true" />
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
              {error && <span className="mt-2 block text-red-600 dark:text-red-400">{error}</span>}
            </>
          }
          onClose={close}
          actions={
            <>
              <Button variant="secondary" size="sm" disabled={pending} onClick={close}>
                Keep it
              </Button>
              <Button
                variant="danger"
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
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
