import { FilesList, type FileLink } from "@/components/files-list";
import { MediaGrid, type MediaItem } from "@/components/media-grid";
import { Section } from "@/components/ui";
import { deleteTaskFile } from "./actions";

/**
 * The task page's photos and files (docs/specs/uploads-photos.md 2.4 and
 * 2.5), fed by taskMedia() in lib/tasks/media.ts: the grid, then the
 * documents and links, staff deleting from either. Nothing while there's
 * nothing.
 *
 * Contract (build plan 1.5, UP1 finishes it): the section titled for what it
 * holds ("Photos and files 14"), the "At finish" group from `atFinish`, and
 * Download all in its header. Until then it is the section as it was:
 * "Photos 12" (or "Files"), every photo in the order given.
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
  void taskId;
  void atFinish;
  if (media.length === 0 && files.length === 0) return null;
  return (
    <Section
      title={
        <>
          {media.length > 0 ? "Photos" : "Files"}
          {media.length > 0 && " "}
          {media.length > 0 && <span className="ml-1 font-normal tabular-nums text-fg-3">{media.length}</span>}
        </>
      }
    >
      <div className="space-y-3">
        <MediaGrid items={media} onDelete={deleteTaskFile} />
        <FilesList files={files} onDelete={deleteTaskFile} />
      </div>
    </Section>
  );
}
