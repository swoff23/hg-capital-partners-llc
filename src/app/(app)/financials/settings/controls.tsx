"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { disconnectQuickbooks, setAccountingMethod } from "./actions";

/**
 * How the Intuit sign-in ended (oauthReturnLine in lib/quickbooks/notices.ts).
 * Strips ?connected / ?error once shown, so a reload doesn't repeat it;
 * replaceState leaves the server-rendered line on screen and Next keeps its
 * router in step.
 */
export function OAuthReturnNotice({
  tone,
  text,
  retryHref,
}: {
  tone: "info" | "error";
  text: string;
  retryHref: string | null;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return (
    <p className={cn("text-xs", tone === "error" ? "text-red-600 dark:text-red-400" : "text-muted")}>
      {text}
      {retryHref && (
        <>
          {" "}
          <a href={retryHref} className="text-primary hover:underline">
            Connect again
          </a>
        </>
      )}
    </p>
  );
}

export function BasisToggle({ current }: { current: "CASH" | "ACCRUAL" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
      {(["CASH", "ACCRUAL"] as const).map((b) => (
        <button
          key={b}
          disabled={pending || b === current}
          onClick={() => start(() => setAccountingMethod(b).then(() => router.refresh()))}
          className={cn(
            "px-2.5 py-1 capitalize",
            b === current ? "bg-primary text-primary-foreground" : "hover:bg-background",
          )}
        >
          {b.toLowerCase()}
        </button>
      ))}
    </span>
  );
}

export function DisconnectButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
        Disconnect
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-muted">Also delete the synced ledger data?</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => start(() => disconnectQuickbooks(false).then(() => router.refresh()))}
      >
        Keep data
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => start(() => disconnectQuickbooks(true).then(() => router.refresh()))}
      >
        Delete everything
      </Button>
      <button className="text-muted hover:underline" onClick={() => setConfirm(false)}>
        cancel
      </button>
    </span>
  );
}
