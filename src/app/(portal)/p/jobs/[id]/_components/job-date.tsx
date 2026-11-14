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
    if (!openOnLoad || !editable) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("do");
    window.history.replaceState(null, "", url);
    // After the page has drawn, so the layer measures the screen it opens on.
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [openOnLoad, editable]);

  if (!editable) {
    return target ? (
      <span className="truncate text-meta text-fg-3">
        <DueDate target={target} isVisit={isVisit} today={today} />
      </span>
    ) : null;
  }

  function pick(next: Ymd | null) {
    if (!next || next === target) return;
    startSaving(async () => {
      const res = await callAction(() => setJobDateAction(taskId, next));
      toast({ message: res.ok ? `Due date moved to ${fmtDay(next, { weekday: true, year: "auto", now: today })}` : res.error });
    });
  }

  return (
    <PickerLayer
      isOpen={open}
      onOpenChange={setOpen}
      title="Due date"
      motion="pop"
      trigger={
        <AriaButton
          isDisabled={saving}
          onHoverStart={warmDatePanel}
          onFocus={warmDatePanel}
          onPressStart={warmDatePanel}
          aria-label={target ? `Change the due date: ${fmtDay(target)}` : "Set a due date"}
          className={cn(
            "min-w-0 truncate rounded-sm text-meta text-fg-3 underline decoration-dotted decoration-1 underline-offset-4 hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-act focus-visible:outline-solid",
            // A 44px target on touch without making the line any taller.
            "pointer-coarse:-my-2.5 pointer-coarse:py-2.5",
          )}
        >
          {/* The same words as before; the date's own label still says Due or Visit until the page drops "visit". */}
          {target ? <DueDate target={target} isVisit={isVisit} today={today} /> : "Set a date"}
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
