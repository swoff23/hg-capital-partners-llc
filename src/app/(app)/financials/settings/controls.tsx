"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, textLinkClass } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SegmentedControl } from "@/components/segmented-control";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { Notice } from "../_components/ui";
import { disconnectQuickbooks, setAccountingMethod } from "./actions";

/**
 * Runs a Settings action, then refreshes the page's server data. A call that
 * fails (no signal, a server error) comes back as a toast instead of
 * swapping the page for the error screen; the controls show the saved value
 * again (ADMIN-001 in docs/uiux-review/admin.md).
 */
export function useSettingsAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      const res = await callAction(async () => {
        await fn();
        return { ok: true as const, data: undefined };
      });
      if (!res.ok) {
        toast({ message: res.error });
        return;
      }
      router.refresh();
    });
  return [pending, run] as const;
}

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
  const retry = retryHref && (
    <>
      {" "}
      <a href={retryHref} className={textLinkClass}>
        Connect again
      </a>
    </>
  );
  // A failed sign-in is a status: its glyph and its words in a Notice, as the Overview's sync notice is.
  if (tone === "error") {
    return (
      <Notice
        icon={
          <TriangleAlert
            aria-hidden="true"
            strokeWidth={2}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger pointer-coarse:h-4 pointer-coarse:w-4"
          />
        }
      >
        {text}
        {retry}
      </Notice>
    );
  }
  return (
    <p className="text-meta text-fg-3">
      {text}
      {retry}
    </p>
  );
}

const BASES = [
  { key: "CASH", label: "Cash" },
  { key: "ACCRUAL", label: "Accrual" },
] as const;

/** The basis every Financials figure uses unless a page's ?basis= overrides it. */
export function BasisToggle({ current }: { current: "CASH" | "ACCRUAL" }) {
  const [pending, run] = useSettingsAction();
  return (
    <SegmentedControl
      aria-label="Basis"
      options={BASES}
      value={current}
      onChange={(b) => {
        if (pending || b === current) return;
        run(() => setAccountingMethod(b));
      }}
      className={cn(pending && "opacity-50")}
    />
  );
}

/** Disconnect asks whether to keep the synced ledger, in one dialog with both answers. */
export function DisconnectButton() {
  const [pending, run] = useSettingsAction();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Disconnect
      </Button>
      {open && (
        <ConfirmDialog
          title="Disconnect QuickBooks"
          body="Also delete the synced ledger data?"
          busy={pending}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => disconnectQuickbooks(false))}>
                Keep data
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => disconnectQuickbooks(true))}
              >
                Delete synced data
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
