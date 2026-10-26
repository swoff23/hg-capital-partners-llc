import { FilesList, type FileLink } from "@/components/files-list";
import { MediaGrid, type MediaGroup } from "@/components/media-grid";
import { Section } from "@/components/ui";
import { taskFileUrl } from "@/lib/attachments/media";
import type { JobFile, JobMedia } from "@/lib/portal/queries";

/** A document HG shared on the job. The size, who added it and when ride along once the page reads them. */
type SharedFile = JobFile & { size?: number | null; uploadedBy?: string | null; createdAt?: Date | string };

/**
 * The job page's photos and files (docs/specs/uploads-photos.md 2.5): the
 * grid of everything the contractor may see on the job, newest first with the
 * photos sent with the latest Mark done leading under "At finish", then the
 * documents HG shared on the job as rows with who added each and when, each
 * opening the file. Download only: a contractor deletes nothing here.
 * Nothing while there's nothing. Titled for what it holds, as the task page's
 * is: "Photos and files 14", "Photos 12" or "Files 3" (TASKS-011).
 *
 * `atFinish` is the ids in `media` sent with the latest Mark done, read from
 * the job's events (lib/tasks/media.ts finishPhotoIds); without it there are
 * no labels (G1D-034). `media` arrives in grid order. `files` are the shared
 * documents, today shown only inside the update that carried them.
 */
export function JobMediaSection({
  media,
  files = [],
  atFinish = [],
}: {
  media: JobMedia[];
  files?: SharedFile[];
  /** The ids in `media` sent with the latest Mark done. */
  atFinish?: readonly string[];
}) {
  if (media.length === 0 && files.length === 0) return null;

  const rows: FileLink[] = files.map((f) => ({
    id: f.id,
    kind: "FILE",
    filename: f.filename,
    href: taskFileUrl(f.id),
    size: f.size ?? null,
    internal: false,
    uploadedBy: f.uploadedBy ?? null,
    createdAt: f.createdAt,
  }));

  const finish = new Set(atFinish);
  const finishIds = media.filter((m) => finish.has(m.id)).map((m) => m.id);
  const otherIds = media.filter((m) => !finish.has(m.id)).map((m) => m.id);
  // Labels only once there's a Mark done set; each run keeps its place in the order given.
  const groups: MediaGroup[] | undefined =
    finishIds.length > 0
      ? [
          { label: "At finish", ids: finishIds },
          ...(otherIds.length > 0 ? [{ label: "Other photos", ids: otherIds }] : []),
        ]
      : undefined;

  const total = media.length + rows.length;
  const noun = media.length > 0 && rows.length > 0 ? "Photos and files" : media.length > 0 ? "Photos" : "Files";

  return (
    <Section
      title={
        <>
          {noun} <span className="ml-1 font-normal tabular-nums text-fg-3">{total}</span>
        </>
      }
    >
      <div className="space-y-3">
        <MediaGrid items={media} groups={groups} />
        <FilesList files={rows} />
      </div>
    </Section>
  );
}
