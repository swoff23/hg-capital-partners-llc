"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import type { MigrationReport } from "@/lib/attachments/migrate";
import { moveDocumentsToPrivate } from "./actions";

/** Moves the public documents into private storage. The label stays while it works; the button shows the spinner (forms 2.7). */
export function MigrateButton() {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        pending={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            // A dropped connection comes back as a refusal and shows under the button, not as the error page.
            const r = await callAction(() => moveDocumentsToPrivate());
            if (r.ok) setReport(r.data);
            else setError(r.error);
          })
        }
      >
        Move documents to private storage
      </Button>
      {error && <p className="text-meta text-danger">{error}</p>}
      {report && (
        <p className="text-meta text-fg-3">
          Scanned {report.scanned} · already private {report.alreadyPrivate} · moved {report.moved}
          {report.failed.length > 0 && (
            <>
              {" "}· failed {report.failed.length}: {report.failed.map((f) => f.filename).join(", ")}
            </>
          )}
        </p>
      )}
    </div>
  );
}
