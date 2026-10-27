import { requireUser } from "@/lib/auth";
import { stillPublicCount } from "@/lib/attachments/migrate";
import { Section } from "@/components/ui";
import { MigrateButton } from "./migrate-button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Storage" };

export const dynamic = "force-dynamic";

/**
 * One status line (docs/specs/uploads-photos.md, Migration map, Settings):
 * how many files are still public, with the button that moves them, or that
 * all of them are private. Once it reads all private for good the tab can go
 * (IA-024; Connor's OK at review).
 *
 * What the old caveat paragraphs said, for whoever reads this: private blobs
 * open only for people signed in here, through the session-checked
 * /api/files routes; listing photos and the property photo stay public for
 * the public site; uploads made before documents went private stay public
 * until they are moved; with no BLOB_READ_WRITE_TOKEN in the environment
 * there is no store to count or move, which is what "isn't set up" means.
 */
export default async function StorageSettingsPage() {
  await requireUser();
  const publicFiles = await stillPublicCount();

  return (
    <div className="space-y-8 pointer-coarse:space-y-6">
      <Section title="Documents">
        <div className="max-w-prose space-y-3 text-pretty text-body">
          {publicFiles === null ? (
            <p className="text-fg-2">Storage isn&apos;t set up on this site yet.</p>
          ) : publicFiles === 0 ? (
            <p className="text-fg-1">All documents are private.</p>
          ) : (
            <>
              <p className="num text-fg-1">{publicFiles === 1 ? "1 document is still public." : `${publicFiles} documents are still public.`}</p>
              <MigrateButton />
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
