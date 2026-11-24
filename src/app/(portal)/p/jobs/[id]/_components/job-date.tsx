"use client";
import { useEffect, useTransition } from "react";
import { Button as AriaButton } from "react-aria-components";
import { AfterDueMark } from "@/components/after-due-mark";
import { DatePanel, warmDatePanel } from "@/components/due-date-picker";
import { PickerLayer } from "@/components/picker-layer";
import { useToast } from "@/components/toast";
import { textLinkClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { fmtDay, type Ymd } from "@/lib/dates";
import { dateParts } from "@/lib/portal/job-view";
import { isAfterDue } from "@/lib/tasks/rules";
import { cn } from "@/lib/utils";
import { setJobDateAction } from "../actions";
import { useScheduleOpen } from "./schedule-open";

/**
 * The job's days, one row of the job card under the address (docs/specs/
 * contractor-scheduled-date.md; Connor, Nov 22, card B): "Scheduled", the
 * contractor's own day, on the left and "Due", HG Capital's, on the right,
 * each a small label over the value, so each has half the phone's width and
 * the full day always fits at 320. While they may set it (`editable`,
 * contractorMaySetDate) a link under their day reads Schedule, or Reschedule
 * once set; it opens the date panel the task page's date chips use (DatePanel
 * in a PickerLayer: a popover with a mouse, a sheet on a phone), whose last
 * pick is Remove day once there's a day to take off. The after-due mark sits
 * beside the day.
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
  // Shared with the bar's Schedule, which opens this same picker (schedule-open.tsx).
  const [open, setOpen] = useScheduleOpen();
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

  if (!editable && !due && !scheduled) return null;

  function pick(next: Ymd | null) {
    // While a pick saves the trigger is pending (React Aria keeps it focused and won't open it), so there's no second pick.
    if (next === scheduled) return;
    // Remove day: the job asks for a day again.
    if (!next) {
      startSaving(async () => {
        const res = await callAction(() => setJobDateAction(taskId, null));
        toast({ message: res.ok ? "Scheduled day removed" : res.error });
      });
      return;
    }
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

  const dueDay = due ? dateParts(due, "due", today).day : null;
  const day = scheduled ? dateParts(scheduled, "scheduled", today).day : null;
  const panel = (
    <PickerLayer
      isOpen={open}
      onOpenChange={setOpen}
      title="Scheduled day"
      motion="pop"
      // As the task page's date chips: beside the row on a short laptop screen where it fits neither above nor below.
      besideWhenShort
      trigger={
        // A text link under the day (Connor, Nov 22, B), 44px tall on touch so it's still a full tap.
        <AriaButton
          isPending={saving}
          onHoverStart={warmDatePanel}
          onFocus={warmDatePanel}
          onPressStart={warmDatePanel}
          aria-label={day ? `Reschedule, now ${day}` : undefined}
          className={cn(textLinkClass, "mt-0.5 inline-flex min-h-8 items-center text-label font-medium pointer-coarse:min-h-11")}
        >
          {day ? "Reschedule" : "Schedule"}
        </AriaButton>
      }
    >
      {({ container, close }) => (
        <DatePanel
          value={scheduled}
          today={today}
          label="Scheduled day"
          layout={container === "sheet" ? "steps" : "together"}
          // Remove day, once there's a day to take off (Connor, Nov 22).
          allowNone={!!scheduled}
          noneLabel="Remove day"
          onPick={(next) => {
            close();
            pick(next);
          }}
        />
      )}
    </PickerLayer>
  );
  // One row of the job card: their day on the left and Due on the right, each a small label over the value
  // (Connor, Nov 22, B; Airbnb's check-in | checkout pair). Reschedule (or Schedule) is a link under their day, while
  // it's theirs to set. Started or in review with no day, Due alone.
  const showDay = editable || !!day;
  const afterDue = !!(due && day && isAfterDue(scheduled, due));
  return (
    <div className={cn("grid divide-x divide-border", showDay && dueDay ? "grid-cols-2" : "grid-cols-1")}>
      {showDay && (
        <div id="schedule" className="min-w-0 scroll-mt-[calc(var(--app-bar-h)+1rem)] px-4 py-3">
          <p className="text-meta text-muted-foreground">Scheduled</p>
          <p className={cn("mt-0.5 flex min-w-0 items-center gap-1.5 text-body", day ? "text-foreground" : "text-muted-foreground")}>
            <span className="min-w-0 break-words text-pretty">{day ?? "Not set"}</span>
            {afterDue && due && <AfterDueMark due={due} today={today} />}
          </p>
          {editable && panel}
        </div>
      )}
      {dueDay && (
        <div className="min-w-0 px-4 py-3">
          <p className="text-meta text-muted-foreground">Due</p>
          <p className="mt-0.5 break-words text-pretty text-body text-foreground">{dueDay}</p>
        </div>
      )}
    </div>
  );
}
