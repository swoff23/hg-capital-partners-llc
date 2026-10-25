import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { attachmentCounts } from "@/lib/attachments/migrate";
import { PageHeader, Section } from "@/components/ui";
import { MigrateButton } from "./migrate-button";

export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
  await requireUser();
  const counts = await attachmentCounts();
  const configured = !!getEnv().BLOB_READ_WRITE_TOKEN;

  return (
    <div className="space-y-8 pointer-coarse:space-y-6">
      <PageHeader title="Settings" subtitle="Where uploaded documents live" />
      <Section title="Documents">
        <div className="max-w-prose space-y-3 text-pretty text-body">
          <p className="text-fg-2">
            Property documents and task attachments are stored as <strong className="font-medium text-fg-1">private</strong> blobs and
            served only to signed-in users through <code className="font-mono">/api/files</code>. Rental listing photos stay
            public because the public site shows them.
          </p>
          <p className="num text-fg-1">
            {counts.properties} property document{counts.properties === 1 ? "" : "s"} · {counts.tasks} task attachment
            {counts.tasks === 1 ? "" : "s"}
          </p>
          <p className="text-fg-2">
            Files uploaded before this change are still public. Run this once to move them; it is safe to run again.
          </p>
          <MigrateButton disabled={!configured} />
          {!configured && (
            <p className="text-meta text-fg-3">Needs a Blob store token, and this environment doesn&apos;t have one.</p>
          )}
        </div>
      </Section>
    </div>
  );
}
