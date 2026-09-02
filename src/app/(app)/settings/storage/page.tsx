import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { attachmentCounts } from "@/lib/attachments/migrate";
import { Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { MigrateButton } from "./migrate-button";

export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
  await requireUser();
  const counts = await attachmentCounts();
  const configured = !!getEnv().BLOB_READ_WRITE_TOKEN;

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Storage — where uploaded documents live" />
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <p className="text-muted">
            Property documents and task attachments are stored as <strong>private</strong> blobs and
            served only to signed-in users through <code>/api/files</code>. Rental listing photos stay
            public on purpose — they are on the public site.
          </p>
          <p>
            {counts.properties} property document{counts.properties === 1 ? "" : "s"} ·{" "}
            {counts.tasks} task attachment{counts.tasks === 1 ? "" : "s"}
          </p>
          <p className="text-muted">
            Files uploaded before this change are still public. Run this once to move them; it is safe
            to run again.
          </p>
          <MigrateButton disabled={!configured} />
          {!configured && (
            <p className="text-xs text-muted">Not available here — no Blob store token in this environment.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
