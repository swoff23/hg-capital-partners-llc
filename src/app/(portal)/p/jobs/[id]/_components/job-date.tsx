"use client";
import { useEffect, useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { AfterDueMark } from "@/components/after-due-mark";
import { DatePanel, warmDatePanel } from "@/components/due-date-picker";
import { PickerLayer } from "@/components/picker-layer";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { fmtDay, type Ymd } from "@/lib/dates";
import { dateParts } from "@/lib/portal/job-view";
import { isAfterDue } from "@/lib/tasks/rules";
import { cn } from "@/lib/utils";
import { setJobDateAction } from "../actions";

/**
 * The job's two days under the address, as a field list (docs/specs/
 * contractor-scheduled-date.md, section 3.2, Q3 A): "Scheduled", the
 * contractor's own day, and "Due", HG Capital's, which they never change.
 * Hairlines between rows, a fixed label column, and the rows held to the text
 * column so the label and day don't drift apart across a wide laptop.
 *
 * The Scheduled row shows only while the contractor may set a day (`editable`,
 * contractorMaySetDate) and is one tap target, 44px on touch, that opens the
 * date panel the task page's date chips use (DatePanel in a PickerLayer: a
 * popover with a mouse, a sheet on a phone), with no "No date". The button
 * covers the row and the words sit over it, so the warning mark can be its own
 * button without nesting one in another. The day keeps the dotted underline of
 * tap-to-edit.
 *
 * `openOnLoad` is an email's Change date (`?do=date`): the panel opens once
 * the page is up, and the ?do= comes off the address.
 */
export function JobDates({
  taskId,
  scheduled,
  due,
  today,
  editable,
  needsNotice,
  openOnLoad = false,
}: {
  taskId: string;
  scheduled: Ymd | null;
  due: Ymd | null;
  today: Ymd;
  editable: boolean;
  needsNotice: boolean;
  openOnLoad?: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    // Only while the address still asks: Back to a page whose ?do= was taken off doesn't reopen it.
    if (!openOnLoad || new URLSearchParams(window.location.search).get("do") !== "date") return;
    // The next frame, after the page has drawn, so the layer measures the screen it opens on. The ?do= comes off there
    // whether or not the job takes a day now, so a later change can't open it unasked; an effect run twice in
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

  if (!editable && !due) return null;

  function pick(next: Ymd | null) {
    // While a pick saves the trigger is pending (React Aria keeps it focused and won't open it), so there's no second pick.
    if (!next || next === scheduled) return;
    const day = fmtDay(next, { weekday: true, year: "auto", now: today });
    // A tenant at home needs 24 hours' notice (Q7), so the toast says it when the day is today or tomorrow.
    const when = dateParts(next, "scheduled", today).day;
    const message =
      needsNotice && when === "Today"
        ? "Scheduled for today. Only go in if the tenant said yes."
        : needsNotice && when === "Tomorrow"
          ? "Scheduled for tomorrow. The tenant needs 24 hours' notice."
          : scheduled
            ? `Moved to ${day}`
            : `Scheduled for ${day}`;
    startSaving(async () => {
      const res = await callAction(() => setJobDateAction(taskId, next));
      toast({ message: res.ok ? message : res.error });
    });
  }

  const label = "w-24 shrink-0 text-meta font-medium text-fg-2";
  return (
    <div className="mt-3 max-w-sm divide-y divide-border border-y border-border">
      {editable && (
        <div className="relative flex min-h-11 items-center">
          <PickerLayer
            isOpen={open}
            onOpenChange={setOpen}
            title="Scheduled day"
            motion="pop"
            // As the task page's date chips: beside the row on a short laptop screen where it fits neither above nor below.
            besideWhenShort
            trigger={
              <AriaButton
                isPending={saving}
                onHoverStart={warmDatePanel}
                onFocus={warmDatePanel}
                onPressStart={warmDatePanel}
                className="absolute inset-0 rounded-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <span className="sr-only">
                  Scheduled day, {scheduled ? dateParts(scheduled, "scheduled", today).day : "none set"}, change
                </span>
              </AriaButton>
            }
          >
            {({ container, close }) => (
              <DatePanel
                value={scheduled}
                today={today}
                label="Scheduled day"
                layout={container === "sheet" ? "steps" : "together"}
                allowNone={false}
                onPick={(next) => {
                  close();
                  pick(next);
                }}
              />
            )}
          </PickerLayer>
          {/* The words sit over the button and let a tap through; only the warning mark takes its own. */}
          <span aria-hidden="true" className={cn(label, "pointer-events-none relative")}>
            Scheduled
          </span>
          <span className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-1.5 text-meta text-foreground">
            <span className="truncate underline decoration-dotted decoration-1 underline-offset-4" aria-hidden="true">
              {scheduled ? dateParts(scheduled, "scheduled", today).day : "Set a day"}
            </span>
            {due && isAfterDue(scheduled, due) && <AfterDueMark due={due} today={today} />}
          </span>
          <ChevronRight aria-hidden="true" className="pointer-events-none relative size-4 shrink-0 text-muted-foreground" />
        </div>
      )}
      {due && (
        <div className="flex min-h-11 items-center">
          <span className={label}>Due</span>
          <span className="truncate text-meta text-muted-foreground">{dateParts(due, "due", today).day}</span>
        </div>
      )}
    </div>
  );
}
