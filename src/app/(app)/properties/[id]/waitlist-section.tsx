"use client";
import { useEffect, useOptimistic, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Copy, Download, MoreHorizontal } from "lucide-react";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { Button, Section, buttonClass } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { useRun } from "@/components/use-run";
import { mailtoHref, textHref } from "@/lib/contacts";
import { fmtDay } from "@/lib/dates";
import {
  EMAILS_COPY_FAILED,
  EMAIL_COPIED,
  EMAIL_COPY_FAILED,
  WAITLIST_CSV_TYPE,
  emailsCopiedToast,
  removedToast,
  waitlistCsv,
  waitlistCsvName,
  waitlistEmails,
  type RemovedWaitlistEntry,
  type WaitlistRow,
} from "@/lib/waitlist/fields";
import { removeWaitlistEntry, restoreWaitlistEntry } from "../actions";

/**
 * The sign-up list at the foot of a coming-soon listing's sheet (coming-soon.md
 * 3.5): "Waiting · 3" with Copy emails and Download, then one row per person,
 * newest first, each with a ⋯ menu. The list is read-only context for the
 * listing: it never enters the sheet's draft or its save. Remove takes the
 * row off at once, toasts with Undo, and Undo puts it back whole.
 */
export function WaitlistSection({
  propertyId,
  street,
  unitLabel,
  rows,
}: {
  propertyId: string;
  /** The property's street, which with the unit names the .csv. */
  street: string;
  unitLabel: string;
  /** The listing's sign-ups as the page holds them, newest first. */
  rows: WaitlistRow[];
}) {
  const run = useRun();
  const coarse = useCoarsePointer();
  // Rows taken off this visit: gone at once, before the page has caught up, and back when Undo lands.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // Hidden inside the action's transition, where a plain setter would wait for the round trip to finish.
  const [hiddenNow, hideNow] = useOptimistic(hidden, (s, id: string) => new Set(s).add(id));
  // The section stays up after its last row goes, so focus has its heading to land on.
  const [removedAny, setRemovedAny] = useState(false);
  const [focusOn, setFocusOn] = useState<{ n: number; id: string | null } | null>(null);
  const menus = useRef(new Map<string, HTMLButtonElement>());
  const heading = useRef<HTMLSpanElement>(null);

  // Focus moves after the closing menu has let go of it (it hands focus back to the ⋯ that is now gone).
  useEffect(() => {
    if (!focusOn) return;
    let frame = 0;
    let tries = 0;
    const tick = () => {
      if (document.querySelector('[role="menu"]') && tries++ < 60) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const target = focusOn.id ? menus.current.get(focusOn.id) : undefined;
      (target ?? heading.current)?.focus();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [focusOn]);

  const shown = rows.filter((r) => !hiddenNow.has(r.id));
  if (shown.length === 0 && !removedAny) return null;

  const unhide = (id: string) =>
    setHidden((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });

  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(waitlistEmails(shown));
      run.toast({ message: emailsCopiedToast(shown.length) });
    } catch {
      run.toast({ message: EMAILS_COPY_FAILED });
    }
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      run.toast({ message: EMAIL_COPIED });
    } catch {
      run.toast({ message: EMAIL_COPY_FAILED });
    }
  }

  // The file is built here from the rows on the page, so nothing waits on the server.
  function download() {
    const url = URL.createObjectURL(new Blob([waitlistCsv(shown)], { type: WAITLIST_CSV_TYPE }));
    const a = document.createElement("a");
    a.href = url;
    a.download = waitlistCsvName(street, unitLabel);
    document.body.append(a);
    a.click();
    a.remove();
    // Safari reads the blob after the click, so the URL outlives it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function remove(row: WaitlistRow) {
    // Focus goes to the next row's ⋯, or to the heading when this was the last.
    const next = shown[shown.findIndex((r) => r.id === row.id) + 1];
    let removed: RemovedWaitlistEntry | null = null;
    // Outside the transition, so the heading stays mounted and focus moves while the row is optimistically gone.
    setRemovedAny(true);
    setFocusOn((f) => ({ n: (f?.n ?? 0) + 1, id: next?.id ?? null }));
    run.run(() => removeWaitlistEntry(propertyId, row.id), {
      before: () => hideNow(row.id),
      succeeded: (data) => {
        removed = data;
        // Keeps the row off if the transition ends before the refreshed rows arrive.
        setHidden((s) => new Set(s).add(row.id));
      },
      done: removedToast(row.firstName),
      key: `waitlist:${row.id}`,
      undo: async () => {
        // Already gone when Remove ran (someone else took it off): nothing to put back.
        if (!removed) return { ok: true as const, data: undefined };
        const res = await restoreWaitlistEntry(propertyId, removed);
        if (res.ok) unhide(row.id);
        return res;
      },
    });
  }

  return (
    <Section
      as="h3"
      title={
        <span ref={heading} tabIndex={-1} className="whitespace-nowrap rounded-sm">
          Waiting · {shown.length}
        </span>
      }
      actions={
        shown.length > 0 && (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={copyEmails}>
              <Copy aria-hidden="true" strokeWidth={1.5} className="size-4 max-[400px]:hidden" />
              Copy emails
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={download}
              aria-label="Download the list"
              className="pointer-coarse:min-w-11"
            >
              <Download aria-hidden="true" strokeWidth={1.5} className="size-4" />
              <span className="max-[400px]:hidden">Download</span>
            </Button>
          </>
        )
      }
    >
      <ul className="-mt-1 divide-y divide-border">
        {shown.map((r) => {
          const mail = mailtoHref(r.email);
          const sms = r.phone ? textHref(r.phone) : null;
          return (
            <li key={r.id} className="flex min-h-14 items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-foreground">{r.firstName}</p>
                {/* The phone follows the email on one line; below 480 it takes a line of its own. */}
                <p className="truncate text-meta text-muted-foreground">
                  {r.email}
                  {r.phone && <span className="num max-[480px]:hidden"> · {r.phone}</span>}
                </p>
                {r.phone && <p className="num truncate text-meta text-muted-foreground min-[480px]:hidden">{r.phone}</p>}
              </div>
              <span className="num shrink-0 whitespace-nowrap text-meta text-muted-foreground">{fmtDay(r.signedUp, { year: "auto" })}</span>
              <MenuTrigger>
                <AriaButton
                  ref={(el) => {
                    if (el) menus.current.set(r.id, el);
                    else menus.current.delete(r.id);
                  }}
                  aria-label={`${r.firstName} actions`}
                  className={buttonClass({ variant: "ghost", size: "sm", icon: true })}
                >
                  <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                </AriaButton>
                <Menu>
                  <MenuItem onAction={() => void copyEmail(r.email)}>Copy email</MenuItem>
                  {mail && <MenuItem href={mail}>Email {r.firstName}</MenuItem>}
                  {/* Touch only, where a tap opens Messages. */}
                  {sms && coarse && <MenuItem href={sms}>Text {r.firstName}</MenuItem>}
                  <MenuSeparator />
                  <MenuItem variant="destructive" onAction={() => remove(r)}>
                    Remove from list
                  </MenuItem>
                </Menu>
              </MenuTrigger>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
