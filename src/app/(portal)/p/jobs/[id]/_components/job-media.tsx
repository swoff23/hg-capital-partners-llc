import { MediaGrid } from "@/components/media-grid";
import { Section } from "@/components/ui";
import type { JobFile, JobMedia } from "@/lib/portal/queries";

/**
 * The job page's photos and videos (docs/specs/uploads-photos.md 2.5): the
 * grid of everything the contractor may see on the job, Download only.
 * Nothing while there's nothing.
 *
 * Contract (build plan 1.5, UP2 finishes it): "Photos and files N" as on the
 * task page, the "At finish" group, then the documents HG shared on the job
 * as FilesList rows from `files`. Until then it is the section as it was:
 * "Photos & videos N".
 */
export function JobMediaSection({ media, files = [] }: { media: JobMedia[]; files?: JobFile[] }) {
  void files;
  if (media.length === 0) return null;
  return (
    <Section
      title={
        <>
          Photos & videos <span className="ml-1 font-normal tabular-nums text-fg-3">{media.length}</span>
        </>
      }
    >
      <MediaGrid items={media} />
    </Section>
  );
}
