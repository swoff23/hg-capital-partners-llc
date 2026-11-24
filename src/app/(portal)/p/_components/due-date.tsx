import type { Ymd } from "@/lib/dates";
import { dateParts } from "@/lib/portal/job-view";

/**
 * A job's day as a label and a day: "Due date Today" or "Scheduled Thu, Oct
 * 29" (docs/specs/contractor-scheduled-date.md, Q8). The label is --fg-2 at
 * 500, so it reads apart from the day (Connor, Oct 26). `shortBelow480`
 * shortens it to "Due" on a My jobs row below 480, where the status leads the
 * subline and the day has to keep showing; a scheduled day has no short label
 * there, since the status already says Scheduled, so the bare day follows the
 * badge.
 */
export function DueDate({
  day,
  kind,
  today,
  shortBelow480 = false,
}: {
  day: Ymd;
  kind: "due" | "scheduled";
  today: Ymd;
  shortBelow480?: boolean;
}) {
  const { label, short, day: text } = dateParts(day, kind, today);
  if (!shortBelow480) {
    return (
      <>
        <span className="font-medium text-fg-2">{label}</span> {text}
      </>
    );
  }
  return (
    <>
      {/* Tailwind's max-[480px] is width < 480, so the pair meets at 480 without both showing. */}
      <span className="max-[480px]:hidden">
        <span className="font-medium text-fg-2">{label}</span>{" "}
      </span>
      {short && (
        <span className="min-[480px]:hidden">
          <span className="font-medium text-fg-2">{short}</span>{" "}
        </span>
      )}
      {text}
    </>
  );
}
