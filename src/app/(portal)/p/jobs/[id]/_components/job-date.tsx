"use client";
import { useEffect, useState, useTransition } from "react";
import { Button as AriaButton } from "react-aria-components";
import { DatePanel, warmDatePanel } from "@/components/due-date-picker";
import { PickerLayer } from "@/components/picker-layer";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { fmtDay, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { setJobDateAction } from "../actions";
import { DueDate } from "../../../_components/due-date";

/**
 * The job's date in the header, which the contractor can change
 * (docs/specs/contractor-job-emails.md, section 7): the day they agreed with
 * the tenant becomes the due date, and HG hears of it. Tap-to-edit, as the
 * craft rules ask on touch: the date itself opens the date panel, the one
 * the task page's date chips use (DatePanel in a PickerLayer: a popover with
 * a mouse, a sheet on a phone), with no "No date". A job they can't re-date
 * shows the date as before.
 *
 * `openOnLoad` is an email's Change date (`?do=date`): the panel opens once
 * the page is up, and the ?do= comes off the address.
 */
export function JobDate({
  taskId,
  target,
  isVisit,
  today,
  editable,
  openOnLoad = false,
}: {
  taskId: string;
  target: Ymd | null;
  isVisit: boolean;
  today: Ymd;
  editable: boolean;
  openOnLoad?: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    // Only while the address still asks: Back to a page whose ?do= was taken off doesn't reopen it.
    if (!openOnLoad || new URLSearchParams(window.location.search).get("do") !== "date") return;
    // The next frame, after the page has drawn, so the layer measures the screen it opens on. The ?do= comes off there
    // whether or not the job takes a date now, so a later change can't open it unasked; an effect run twice in
    // development still opens it once.
    const frame = requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("do");
      window.history.replaceState(null, "", url);
      if (editable) setOpen(true);
    });
    return () => cancelAnimationFrame(frame);
    // Once per page load, with the job as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnLoad]);

  if (!editable) {
    return target ? (
      <span className="truncate text-meta text-fg-3">
        <DueDate target={target} isVisit={isVisit} today={today} />
      </span>
    ) : null;
  }

  function pick(next: Ymd | null) {
    // While a pick saves the trigger is pending (React Aria keeps it focused and won't open it), so there's no second pick.
    if (!next || next === target) return;
    const day = fmtDay(next, { weekday: true, year: "auto", now: today });
    startSaving(async () => {
      const res = await callAction(() => setJobDateAction(taskId, next));
      toast({ message: res.ok ? (target ? `Due date moved to ${day}` : `Due date set for ${day}`) : res.error });
    });
  }

  return (
    <PickerLayer
      isOpen={open}
      onOpenChange={setOpen}
      title="Due date"
      motion="pop"
      // As the task page's date chips: beside the date on a short laptop screen where it fits neither above nor below.
      besideWhenShort
      trigger={
        <AriaButton
          isPending={saving}
          onHoverStart={warmDatePanel}
          onFocus={warmDatePanel}
          onPressStart={warmDatePanel}
          className={cn(
            "min-w-0 truncate rounded-sm text-meta text-fg-3 underline decoration-dotted decoration-1 underline-offset-4 hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-act focus-visible:outline-solid",
            // A 44px target on touch (20px line plus 12px each side) without making the line any taller.
            "pointer-coarse:-my-3 pointer-coarse:py-3",
          )}
        >
          {/* The visible words are its name; the date's own label still says Due or Visit until the page drops "visit". */}
          {target ? (
            <>
              <DueDate target={target} isVisit={isVisit} today={today} />
              <span className="sr-only">, change</span>
            </>
          ) : (
            "Set a date"
          )}
        </AriaButton>
      }
    >
      {({ container, close }) => (
        <DatePanel
          value={target}
          today={today}
          label="Due date"
          layout={container === "sheet" ? "steps" : "together"}
          allowNone={false}
          onPick={(next) => {
            close();
            pick(next);
          }}
        />
      )}
    </PickerLayer>
  );
}
