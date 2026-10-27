import type { Ymd } from "@/lib/dates";
import { dueDateParts } from "@/lib/portal/job-view";

/**
 * A job's date as a label and a day: "Due date Today", or "Visit date Thu,
 * Oct 29" for a booked visit. The label is --fg-2 at 500, so it reads apart
 * from the day (Connor, Oct 26). `shortBelow480` shortens it to "Due" or
 * "Visit" on a My jobs row below 480, where the status leads the subline and
 * the day has to keep showing.
 */
export function DueDate({
  target,
  isVisit,
  today,
  shortBelow480 = false,
}: {
  target: Ymd;
  isVisit: boolean;
  today: Ymd;
  shortBelow480?: boolean;
}) {
  const { label, short, day } = dueDateParts(target, isVisit, today);
  return (
    <>
      <span className="font-medium text-fg-2">
        {shortBelow480 ? (
          <>
            {/* Tailwind's max-[480px] is width < 480, so the pair meets at 480 without both showing. */}
            <span className="max-[480px]:hidden">{label}</span>
            <span className="min-[480px]:hidden">{short}</span>
          </>
        ) : (
          label
        )}
      </span>{" "}
      {day}
    </>
  );
}
