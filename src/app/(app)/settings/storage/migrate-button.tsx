"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import type { MigrationReport } from "@/lib/attachments/migrate";
import { moveDocumentsToPrivate } from "./actions";

export function MigrateButton({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await moveDocumentsToPrivate();
            if (r.ok) setReport(r.data);
            else setError(r.error);
          })
        }
      >
        {pending ? "Moving…" : "Move documents to private storage"}
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {report && (
        <p className="text-xs text-muted">
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
