"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { Download, Ellipsis, ExternalLink, FileImage, FileSpreadsheet, FileText, Lock, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Lightbox, useViewerLink, type MediaItem } from "@/components/lightbox";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { UploadStatusLine, type MediaUpload, type MediaUploaderApi } from "@/components/media-uploader";
import { Button, Input, buttonClass } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { useFocusAfterMenu } from "@/components/use-focus-after-menu";
import { useInlineEditKeys } from "@/components/use-inline-edit-keys";
import { callAction, type ActionResult } from "@/lib/action-result";
import { byline, documentLook, downloadUrl, rowReason } from "@/lib/attachments/media";
import { nameExtension } from "@/lib/attachments/content-types";
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
 * job page, property Documents), docs/specs/uploads-photos.md 2.4. A row is
 * the type's glyph (a document, a spreadsheet, a photo kept as a document, a
 * link), the name, a lock for Internal, who added it and when ("Connor ·
 * Oct 3"), the size, and a "…" menu: Open, Download, Rename (with `onRename`)
 * and Delete (with `onDelete`, asked once more in a ConfirmDialog). The "…"
 * shows on hover or focus with a mouse, always on touch.
 *
 * With a mouse a row opens the viewer on the documents (a PDF in the
 * browser's own frame, pushing `?file=<id>` on a page that owns it); on touch
 * it opens the file directly, as before (a link opens its URL in a new tab).
 * One line at 28rem and wider, with the byline and size in fixed columns so
 * sizes line up; narrower, two lines: the name over "PDF · Connor · Oct 3 ·
 * 1.2 MB", and on a phone the size drops rather than wrap.
 *
 * `uploader` puts the files in flight in the list: a ring and "Uploading
 * 40%" with a cancel, "No connection" with Retry and Remove, "Over the 50 MB
 * limit" with Remove, and the shared status line under the rows when two or
 * more failed.
 *
 * `byline` and `menu` are on for a record's own list (when it has `onDelete`
 * or `onRename`) and off in Activity rows, where the comment already names
 * who and when; pass either to say otherwise (the portal's list has Open and
 * Download and no handlers). `onFill` hovers in `--fill-2` on a `--fill-1`
 * ground (an internal comment).
 */
export function FilesList({
  files,
  className,
  onFill = false,
  onDelete,
  onRename,
  byline: showBylineProp,
  menu: showMenuProp,
  uploader,
  link,
}: {
  files: FileLink[];
  className?: string;
  /** On a --fill-1 ground (an internal comment), where that hover would vanish: rows hover in --fill-2. */
  onFill?: boolean;
  /** Removes a file for good; a server action can be passed as is. */
  onDelete?: (id: string) => Promise<ActionResult<unknown>>;
  /** Renames a file (staff); resolves to the saved name. */
  onRename?: (id: string, name: string) => Promise<ActionResult<{ filename: string }>>;
  /** Who added each file and when; off in Activity rows, where the comment already says. */
  byline?: boolean;
  /** The row's ⋯ menu; off in Activity rows. */
  menu?: boolean;
  /** The files going up here: their rows come first-class in the list. */
  uploader?: MediaUploaderApi;
  /** Push `?file=<id>` when the viewer opens. On for a record's own list. */
  link?: boolean;
}) {
  const coarse = useCoarsePointer();
  const showMenu = showMenuProp ?? (!!onDelete || !!onRename);
  const showByline = showBylineProp ?? showMenu;
  const [target, setTarget] = useState<FileLink | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  // The documents the viewer steps through (links have no bytes here).
  const docs = useMemo(() => files.filter((f) => f.kind === "FILE"), [files]);
  const items = useMemo<MediaItem[]>(
    () =>
      docs.map((f) => ({
        id: f.id,
        kind: "FILE",
        filename: names[f.id] ?? f.filename,
        size: f.size,
        uploadedBy: f.uploadedBy,
        internal: f.internal,
        createdAt: f.createdAt ?? new Date(0),
      })),
    [docs, names],
  );
  const hrefs = useMemo(() => new Map(docs.map((f) => [f.id, f.href])), [docs]);
  const viewer = useViewerLink(items, link ?? showMenu);

  const uploads = uploader?.uploads ?? [];
  if (files.length === 0 && uploads.length === 0) return null;

  const close = () => {
    if (pending) return;
    setTarget(null);
    setError("");
  };
  const failedRows = uploads.filter((u) => u.status === "failed" || u.status === "invalid").length;

  // One wrapper, so the confirm (fixed, out of flow) never counts as a sibling in the parent's spacing.
  // The list takes the ground it sits on (the page, or a comment card), so it
  // never nests a darker well inside a lighter card in dark.
  return (
    <div className={cn("@container", className)}>
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
        {files.map((f) => {
          const name = names[f.id] ?? f.filename;
          const look = f.kind === "LINK" ? null : documentLook(name);
          const Icon = f.kind === "LINK" ? ExternalLink : look?.glyph === "sheet" ? FileSpreadsheet : look?.glyph === "image" ? FileImage : FileText;
          const who = showByline ? byline(f.uploadedBy, f.createdAt) : "";
          const size = f.kind === "FILE" && f.size ? formatBytes(f.size) : "";
          const stacked = showByline;
          const sub = [look?.label, who].filter(Boolean).join(" · ");
          const open = (e: React.MouseEvent) => {
            // A mouse opens the viewer on the documents; a modified click, a link and touch go to the file itself.
            if (coarse || f.kind !== "FILE" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            viewer.openAt(docs.findIndex((d) => d.id === f.id));
          };
          return (
            <li key={f.id} className="group/file flex items-center">
              {renaming === f.id ? (
                <div className={cn("flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-3 pointer-coarse:min-h-12", stacked && "py-1.5")}>
                  <Icon className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
                  <RenameRow
                    name={name}
                    onCancel={() => setRenaming(null)}
                    onSave={async (next) => {
                      setRenaming(null);
                      if (next === name || !onRename) return;
                      const res = await callAction(() => onRename(f.id, next));
                      if (res.ok) setNames((n) => ({ ...n, [f.id]: res.data.filename }));
                    }}
                  />
                </div>
              ) : (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={open}
                  // The focus outline drawn inside, where the list's rounded clip can't cut it.
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2.5 px-3 text-body text-fg-1 transition-colors focus-visible:-outline-offset-2",
                    stacked ? "min-h-15 py-1.5 @md:min-h-10 @md:py-0 pointer-coarse:@md:min-h-12" : "min-h-10 pointer-coarse:min-h-11",
                    onFill ? "hover:bg-fill-2" : "hover:bg-fill-1",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{name}</span>
                      {f.internal && <Lock className="size-3.5 shrink-0 text-fg-3" aria-label="Internal" />}
                    </span>
                    {stacked && (sub || size) && (
                      <span className="block truncate text-meta text-fg-3 @md:hidden">
                        {sub}
                        {/* A phone drops the size rather than wrap. */}
                        {size && <span className="max-[479px]:hidden">{sub ? " · " : ""}{size}</span>}
                      </span>
                    )}
                  </span>
                  {stacked && <span className="hidden w-28 shrink-0 truncate text-meta text-fg-3 @md:block">{who}</span>}
                  {size && (
                    <span className={cn("shrink-0 text-meta tabular-nums text-fg-3", stacked ? "hidden w-16 text-right @md:block" : "")}>{size}</span>
                  )}
                </a>
              )}
              {showMenu && renaming !== f.id && (
                <MenuTrigger>
                  <AriaButton
                    aria-label={`More for ${name}`}
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
                    <MenuItem id="open" href={f.href} target="_blank" rel="noreferrer" icon={<ExternalLink />}>
                      Open
                    </MenuItem>
                    {f.kind === "FILE" && (
                      <MenuItem
                        id="download"
                        icon={<Download />}
                        onAction={() => {
                          const a = document.createElement("a");
                          a.href = downloadUrl(f.href);
                          a.download = name;
                          a.click();
                        }}
                      >
                        Download
                      </MenuItem>
                    )}
                    {onRename && (
                      <MenuItem id="rename" icon={<Pencil />} onAction={() => setRenaming(f.id)}>
                        Rename
                      </MenuItem>
                    )}
                    {onDelete && (
                      <MenuItem id="delete" variant="destructive" icon={<Trash2 />} onAction={() => setTarget(f)}>
                        Delete
                      </MenuItem>
                    )}
                  </Menu>
                </MenuTrigger>
              )}
            </li>
          );
        })}
        {uploads.map((u) => (
          <UploadRow key={u.key} upload={u} onRetry={() => uploader!.retry(u.key)} onRemove={() => uploader!.remove(u.key)} />
        ))}
      </ul>
      {uploader && failedRows >= 2 && <UploadStatusLine uploader={uploader} className="mt-2 justify-start" />}
      {items.length > 0 && (
        <Lightbox
          items={items}
          index={viewer.index}
          onIndexChange={viewer.setIndex}
          isOpen={viewer.isOpen}
          onOpenChange={viewer.onOpenChange}
          urlFor={(item) => hrefs.get(item.id) ?? ""}
          onDelete={onDelete}
          onRename={onRename}
          canEdit={!!onRename}
        />
      )}
      {target && onDelete && (
        <ConfirmDialog
          title={target.kind === "LINK" ? "Delete this link?" : "Delete this file?"}
          body={
            <>
              <span className="break-all">“{names[target.id] ?? target.filename}”</span> goes for good.
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

/** The name in place: Enter saves, Esc puts it back. The extension stays, so only the part before it is typed. */
function RenameRow({ name, onSave, onCancel }: { name: string; onSave: (name: string) => void | Promise<void>; onCancel: () => void }) {
  const ext = nameExtension(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  const [text, setText] = useState(stem);
  const field = useRef<HTMLInputElement>(null);
  useFocusAfterMenu(field);
  const keys = useInlineEditKeys(onCancel, () => {
    const typed = text.trim();
    if (!typed) return onCancel();
    // Someone who types the extension too doesn't get it twice.
    const full = ext && !typed.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${typed}.${ext}` : typed;
    void onSave(full);
  });
  return (
    <>
      <Input
        ref={field}
        size="sm"
        aria-label="File name"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={keys.onBlur}
        onKeyDown={keys.onKeyDown}
        className="min-w-0 flex-1"
      />
      {ext && <span className="shrink-0 text-meta text-fg-3">.{ext}</span>}
    </>
  );
}

/** A file going up, or one that didn't: the ring, the percent, the reason, Retry and the cancel. */
function UploadRow({ upload: u, onRetry, onRemove }: { upload: MediaUpload; onRetry: () => void; onRemove: () => void }) {
  const refused = u.status === "invalid";
  const failed = u.status === "failed";
  const look = documentLook(u.name);
  const Icon = look.glyph === "sheet" ? FileSpreadsheet : look.glyph === "image" ? FileImage : FileText;
  const status = failed || refused
    ? rowReason(u.error)
    : u.status === "waiting"
      ? "Waiting for signal"
      : u.status === "saving"
        ? "Saving"
        : u.status === "queued"
          ? "Waiting"
          : `Uploading ${Math.round(u.progress * 100)}%`;
  return (
    <li className="flex min-h-15 items-center @md:min-h-10" aria-label={`${u.name}, ${status}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 text-body text-fg-1">
        {failed || refused ? (
          <Icon className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
        ) : (
          <RowRing value={u.status === "queued" ? 0 : u.progress} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{u.name}</span>
          <span className={cn("block truncate text-meta @md:hidden", failed || refused ? "text-danger" : "text-fg-3")}>
            {status}
            {failed && (
              <>
                {" · "}
                <RowRetry onRetry={onRetry} name={u.name} />
              </>
            )}
          </span>
        </span>
        <span className={cn("hidden shrink-0 truncate text-meta @md:block", failed || refused ? "text-danger" : "text-fg-3")}>{status}</span>
        {failed && (
          <Button variant="ghost" size="sm" onClick={onRetry} aria-label={`Retry ${u.name}`} className="hidden @md:inline-flex">
            <RotateCcw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${failed || refused ? "Remove" : "Cancel upload of"} ${u.name}`}
        className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "mr-1 text-fg-3")}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function RowRetry({ onRetry, name }: { onRetry: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      aria-label={`Retry ${name}`}
      className="relative font-medium underline decoration-1 underline-offset-3 after:absolute after:-inset-3"
    >
      Retry
    </button>
  );
}

/** A 16px ring in the icon's place: an `--fg-1` arc over a `--line` track. The row's name carries the percent. */
function RowRing({ value }: { value: number }) {
  const r = 6.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-line" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        className="text-fg-1 transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
      />
    </svg>
  );
}
