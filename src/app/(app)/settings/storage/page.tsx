import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { attachmentCounts } from "@/lib/attachments/migrate";
import { Section } from "@/components/ui";
import { MigrateButton } from "./migrate-button";

export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
  await requireUser();
  const counts = await attachmentCounts();
  const configured = !!getEnv().BLOB_READ_WRITE_TOKEN;

  return (
    <div className="space-y-8 pointer-coarse:space-y-6">
      <Section title="Documents">
        <div className="max-w-prose space-y-3 text-pretty text-body">
          {/* Private blobs are served to signed-in users through /api/files; listing photos stay public for the public site. */}
          <p className="text-fg-2">Documents and attachments open only for people signed in here.</p>
          <p className="num text-fg-1">
            <span className="whitespace-nowrap">
              {counts.properties} property document{counts.properties === 1 ? "" : "s"}
            </span>{" "}
            ·{" "}
            <span className="whitespace-nowrap">
              {counts.tasks} task attachment{counts.tasks === 1 ? "" : "s"}
            </span>
          </p>
          <p className="text-fg-2">Older uploads stay public until they’re moved.</p>
          <MigrateButton disabled={!configured} />
          {/* No BLOB_READ_WRITE_TOKEN in this environment. */}
          {!configured && <p className="text-meta text-fg-3">Storage isn&apos;t set up on this site yet.</p>}
        </div>
      </Section>
    </div>
  );
}
