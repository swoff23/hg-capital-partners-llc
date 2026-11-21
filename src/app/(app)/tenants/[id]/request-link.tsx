"use client";
import { useEffect, useState } from "react";
import { Ellipsis, Link2Off, RefreshCw } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { useToast } from "@/components/toast";
import { Button, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { fmtDay, todayYmdEastern } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { emailRequestLink, getRequestLink, makeRequestLink, newRequestLink, turnOffRequestLink, type RequestLinkView } from "./actions";

const day = (iso: string) => fmtDay(todayYmdEastern(new Date(iso)), { year: "auto" });

/** "Emailed Nov 21 · used Nov 22", "Used Nov 22", or "Not sent yet". */
function stampOf(v: RequestLinkView | null, off: boolean): string {
  if (off || v?.off) return "Off";
  if (!v) return "";
  const parts = [v.emailedAt ? `Emailed ${day(v.emailedAt)}` : null, v.lastUsedAt ? `${v.emailedAt ? "used" : "Used"} ${day(v.lastUsedAt)}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not sent yet";
}

/**
 * The tenant sheet's Request link part (docs/specs/maintenance-requests.md,
 * section 4.4): Email link when there's an email on file, Copy link for
 * pasting into a text from your own phone, and a ⋯ with Send a new link and
 * Turn off link. The link is read when the sheet opens, so Copy is one tap
 * and the line says when it went and was last used.
 */
export function RequestLinkPart({ leaseId, tenantId, first, hasEmail }: { leaseId: string; tenantId: string; first: string; hasEmail: boolean }) {
  const { toast } = useToast();
  const [view, setView] = useState<RequestLinkView | null>(null);
  const [off, setOff] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void callAction(() => getRequestLink(tenantId, leaseId)).then((res) => {
      if (!live) return;
      if (res.ok) setView(res.data);
      else setProblem(res.error);
    });
    return () => {
      live = false;
    };
  }, [tenantId, leaseId]);

  async function act(run: () => Promise<{ ok: true; data: RequestLinkView } | { ok: false; error: string }>, done: string) {
    setBusy(true);
    const res = await callAction(run);
    setBusy(false);
    if (!res.ok) {
      toast({ message: res.error });
      // What it did before failing (a new link made, its email refused) shows as it is now, so Copy never copies a dead link.
      const now = await callAction(() => getRequestLink(tenantId, leaseId));
      if (now.ok) {
        setView(now.data);
        setOff(now.data.off);
      }
      return;
    }
    setView(res.data);
    setOff(false);
    toast({ message: done });
  }

  async function copy() {
    let link = off ? null : view?.link;
    if (!link) {
      // Turned off: Copy makes the next one, as Email link does.
      const res = await callAction(() => makeRequestLink(tenantId, leaseId));
      if (!res.ok) return toast({ message: res.error });
      setView(res.data);
      setOff(false);
      link = res.data.link;
    }
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ message: "Link copied" });
    } catch {
      toast({ message: "Couldn't copy the link. Try again." });
    }
  }

  async function turnOff() {
    setBusy(true);
    const res = await callAction(() => turnOffRequestLink(tenantId, leaseId));
    setBusy(false);
    if (!res.ok) return toast({ message: res.error });
    setOff(true);
    toast({ message: `${first}'s link is off. The old one no longer works.` });
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="shrink-0 text-label text-foreground">Maintenance request link</span>
        <span className="num min-w-0 truncate text-meta text-muted-foreground">{stampOf(view, off)}</span>
      </div>
      <div className="flex items-center gap-2">
        {hasEmail && (
          <Button type="button" variant="secondary" size="sm" disabled={busy || (!view && !problem)} onClick={() => act(() => emailRequestLink(tenantId, leaseId), `Link emailed to ${first}`)}>
            Email link
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" disabled={busy || (!view && !problem)} onClick={copy}>
          Copy link
        </Button>
        <MenuTrigger>
          <AriaButton
            aria-label="More link actions"
            isDisabled={busy}
            className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-muted-foreground data-pressed:bg-muted")}
          >
            <Ellipsis className="size-4" aria-hidden="true" />
          </AriaButton>
          <Menu>
            <MenuItem
              icon={<RefreshCw />}
              onAction={() =>
                act(
                  () => newRequestLink(tenantId, leaseId, hasEmail),
                  hasEmail ? `New link emailed to ${first}. The old one no longer works.` : "New link made. Copy it to send. The old one no longer works.",
                )
              }
            >
              Send a new link
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" icon={<Link2Off />} onAction={turnOff}>
              Turn off link
            </MenuItem>
          </Menu>
        </MenuTrigger>
      </div>
      {problem && <p className="text-meta text-destructive">{problem}</p>}
    </div>
  );
}
