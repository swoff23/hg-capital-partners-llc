"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { syncNow } from "../settings/actions";

export function RefreshButton({ label = "Refresh from QuickBooks" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[11px] text-muted">{msg}</span>}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            try {
              const r = await syncNow();
              setMsg(
                r.skipped
                  ? "a sync is already running"
                  : r.status === "FAILED"
                    ? `failed: ${r.error ?? "unknown"}`
                    : `${r.status.toLowerCase()} · ${r.lineCount} lines`,
              );
              router.refresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "failed");
            }
          })
        }
      >
        {pending ? "Syncing…" : label}
      </Button>
    </div>
  );
}
