"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { callAction } from "@/lib/action-result";
import { disconnectClaude, startConnect } from "./actions";
import type { ClaudeRowView } from "./claude-state";
import { ConnectSteps } from "./connect-steps";

/**
 * One row per partner (mockup 03-settings-claude.svg): name, state, button. From sm the three sit on one line; on a
 * phone the name and state stack and the button takes the right edge across both, and the state drops to its newer
 * half ("Used today") so it shows whole. Disconnect is on any connected row, Connect only on your own.
 */
export function ClaudeRows({ rows }: { rows: ClaudeRowView[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const list = useRef<HTMLUListElement>(null);
  // Where focus goes once the row is drawn as it will stay: a Connect or Disconnect that was pressed leaves with
  // its button. `connected` waits for the row to flip; without it the row's control is focused as soon as it's there.
  const focusFor = useRef<{ userId: string; connected?: boolean } | null>(null);
  const [asked, setAsked] = useState(0);
  function askFocus(next: { userId: string; connected?: boolean } | null) {
    focusFor.current = next;
    setAsked((n) => n + 1);
  }

  useEffect(() => {
    const want = focusFor.current;
    if (!want) return;
    const row = rows.find((r) => r.userId === want.userId);
    if (!row || (want.connected !== undefined && row.connected !== want.connected)) return;
    const active = document.activeElement;
    // The steps are still closing: wait for the next change.
    if (active?.closest("[role='dialog']")) return;
    // The person moved on: leave focus where they put it.
    if (active && active !== document.body && !list.current?.contains(active)) {
      focusFor.current = null;
      return;
    }
    const li = [...(list.current?.children ?? [])].find((el) => el.getAttribute("data-user") === row.userId);
    const target = li?.querySelector<HTMLElement>("button") ?? li?.querySelector<HTMLElement>("[data-row-name]");
    target?.focus({ preventScroll: true });
    if (want.connected !== undefined) focusFor.current = null;
  }, [asked, rows]);

  async function connect(userId: string) {
    // A second press while the address is made does nothing; the button stays focusable (aria-busy), not disabled.
    if (connecting) return;
    askFocus(null);
    setConnecting(true);
    const r = await callAction(() => startConnect());
    setConnecting(false);
    if (!r.ok) {
      toast({ message: r.error });
      // The row on screen may be stale: reread it.
      router.refresh();
      return;
    }
    askFocus({ userId });
    setAddress(r.data.address);
    setOpen(true);
  }

  function disconnect(userId: string) {
    setBusy(userId);
    askFocus(null);
    start(async () => {
      const r = await callAction(() => disconnectClaude(userId));
      setBusy(null);
      // Refused, the button is enabled again where it was: give it focus back, as a success gives it to what replaced it.
      askFocus(r.ok ? { userId, connected: false } : { userId, connected: true });
      toast(r.ok ? { message: r.data.message, phoneMessage: r.data.phoneMessage } : { message: r.error });
    });
  }

  // The connection is made by Claude's server while this page sits open, so reread the rows when the steps close.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      router.refresh();
      // Focus goes back to the row's control once the steps are gone, and again if the refresh swaps Connect for Disconnect.
      requestAnimationFrame(() => askFocus(focusFor.current));
    }
  }

  return (
    <>
      <ul ref={list} className="border-b border-border">
        {rows.map((row) => (
          <li
            key={row.userId}
            data-user={row.userId}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border py-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
          >
            <span data-row-name="" tabIndex={-1} className="col-start-1 truncate text-body text-foreground">{row.name}</span>
            <span className={cn("col-start-1 truncate text-body sm:col-start-2", row.connected ? "text-fg-2" : "text-muted-foreground")}>
              {row.lead && <span className="max-sm:hidden">{row.lead}</span>}
              {row.tail}
            </span>
            <span className="col-start-2 row-span-2 row-start-1 flex min-h-8 items-center sm:col-start-3 sm:row-span-1 pointer-coarse:min-h-11">
              {row.connected ? (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Disconnect ${row.first}`}
                  pending={busy === row.userId}
                  onClick={() => disconnect(row.userId)}
                >
                  Disconnect
                </Button>
              ) : row.canConnect ? (
                <Button size="sm" aria-busy={connecting || undefined} onClick={() => connect(row.userId)}>
                  Connect
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {address && <ConnectSteps isOpen={open} onOpenChange={onOpenChange} address={address} />}
    </>
  );
}
