"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { isOfflineError, OFFLINE_ERROR } from "@/lib/action-result";
import { syncNow } from "../settings/actions";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/* A thrown call is a dropped connection or a server error; neither message is worth showing raw. */
const DIDNT_FINISH = "Sync didn't finish. Try again.";

/**
 * Runs a full QuickBooks sync now. How it went shows in a toast, so the row of
 * controls it sits in keeps its width; phones get the short label so that row
 * holds one line at 320.
 */
export function RefreshButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await syncNow();
            toast({
              message: r.skipped
                ? "A sync is already running"
                : r.status === "FAILED"
                  ? (r.error ?? DIDNT_FINISH)
                  : r.status === "PARTIAL"
                    ? `Partial sync · ${plural(r.lineCount, "line", "lines")}`
                    : `Synced ${plural(r.lineCount, "line", "lines")}`,
            });
            router.refresh();
          } catch (e) {
            unstable_rethrow(e); // a redirect to sign-in still goes through
            toast({ message: isOfflineError(e) ? OFFLINE_ERROR : DIDNT_FINISH });
          }
        })
      }
    >
      {pending ? (
        "Syncing…"
      ) : (
        <>
          <span className="sm:hidden">Refresh</span>
          <span className="max-sm:hidden">Refresh from QuickBooks</span>
        </>
      )}
    </Button>
  );
}
