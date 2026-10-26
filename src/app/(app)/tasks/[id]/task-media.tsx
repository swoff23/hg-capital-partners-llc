"use client";
import { Download, Ellipsis } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { FilesList, type FileLink } from "@/components/files-list";
import { MediaGrid, type MediaGroup, type MediaItem } from "@/components/media-grid";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { useToast } from "@/components/toast";
import { Section, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { removeTaskFile, renameTaskFile } from "../upload-actions";

/**
 * The task page's photos and files (docs/specs/uploads-photos.md 2.4, 2.5 and
 * 2.6), fed by taskMedia() in lib/tasks/media.ts: the grid, then the
 * documents and links, staff deleting and renaming from either. Nothing while
 * there's nothing.
 *
 * Titled for what it holds ("Photos and files 14", "Photos 12", "Files 3").
 * The grid is newest first; when the job has a Mark done set (`atFinish`),
 * those photos lead under "At finish" and the rest sit under "Other photos".
 * Its header "..." holds "Download all": the server streams one ZIP named for
 * the place and the job ("56 Tamarack St Fix porch light.zip"), the toast
 * reads "Preparing 14 files…", then the browser saves it. A photo or file
 * taken off a posted comment leaves "Connor removed quote.pdf" in the activity.
 */
export function TaskMediaSection({
  taskId,
  media,
  files,
  atFinish = [],
}: {
  taskId: string;
  /** Posted photos and videos, in grid order. */
  media: MediaItem[];
  /** Posted documents and links. */
  files: FileLink[];
  /** The ids in `media` sent with the latest Mark done. */
  atFinish?: readonly string[];
}) {
  const { toast } = useToast();
  if (media.length === 0 && files.length === 0) return null;

  const finish = new Set(atFinish);
  const groups: MediaGroup[] | undefined =
    finish.size > 0
      ? [
          { label: "At finish", ids: media.filter((m) => finish.has(m.id)).map((m) => m.id) },
          { label: "Other photos", ids: media.filter((m) => !finish.has(m.id)).map((m) => m.id) },
        ]
      : undefined;

  // Links have no bytes here, so they aren't in the archive.
  const downloadable = media.length + files.filter((f) => f.kind === "FILE").length;
  const total = media.length + files.length;
  const title = media.length > 0 ? (files.length > 0 ? "Photos and files" : "Photos") : "Files";

  function downloadAll() {
    toast({ message: `Preparing ${downloadable} ${downloadable === 1 ? "file" : "files"}…`, key: `zip:${taskId}` });
    const a = document.createElement("a");
    a.href = `/api/files/zip/task/${encodeURIComponent(taskId)}`;
    a.click();
  }

  return (
    <Section
      title={
        <>
          {title}
          <span className="ml-1 font-normal tabular-nums text-fg-3">{total}</span>
        </>
      }
      actions={
        downloadable > 0 && (
          <MenuTrigger>
            <AriaButton
              aria-label="More for photos and files"
              className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-fg-3 data-pressed:bg-fill-1")}
            >
              <Ellipsis className="size-4" aria-hidden="true" />
            </AriaButton>
            <Menu>
              <MenuItem id="download-all" icon={<Download />} onAction={downloadAll}>
                Download all
              </MenuItem>
            </Menu>
          </MenuTrigger>
        )
      }
    >
      <div className="space-y-3">
        <MediaGrid items={media} groups={groups} onDelete={removeTaskFile} onRename={renameTaskFile} canEdit />
        <FilesList files={files} onDelete={removeTaskFile} onRename={renameTaskFile} />
      </div>
    </Section>
  );
}
