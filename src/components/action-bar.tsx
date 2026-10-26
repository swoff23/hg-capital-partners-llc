"use client";
import type { ReactNode } from "react";
import { useToastInset } from "@/components/toast";
import { cn } from "@/lib/utils";

/** Height of the bar above the safe area: 48px buttons plus 12px padding each side. */
const BAR_PX = 72;
/** What the line adds under the buttons: a 12px gap and a 20px line. */
const LINE_PX = 32;

/**
 * The bar's buttons share its width on phones and tablets; on a wide screen
 * they size to a 240px column at the end. 48px on touch, a mouse's 36px
 * control height otherwise (docs/brand-guidelines.md, section 5). Put it on
 * the `secondary` and `primary` Buttons.
 */
export const actionBarButton = "h-12 min-w-0 flex-1 whitespace-nowrap pointer-fine:h-9 lg:w-60 lg:flex-none";

export type ActionBarProps = {
  /**
   * One status line on the left that truncates: "3 unsaved changes", "39
   * tasks to create" (forms 2.10). The contractor's job bar has none.
   */
  status?: ReactNode;
  /** The secondary Button, left of the primary: Discard, Back, "Add photo/video". */
  secondary?: ReactNode;
  /** The primary Button: Save, Next, "Create 39 tasks", "Mark done". */
  primary?: ReactNode;
  /**
   * One line under the buttons: a disabled primary's reason, a refusal in
   * `--danger`, or a save conflict. The caller gives it its tone and keeps
   * it to one line. The toast moves up to clear it.
   */
  error?: ReactNode;
  className?: string;
};

/**
 * The bar docked to the bottom of the screen that holds a page's next step
 * (forms 2.10): the contractor job page's sticky bar (`job-actions.tsx`),
 * made general. On `--canvas` over a `--line` rule, 12px padding plus the
 * safe area, the buttons on the page's gutters, and the toast lifted above
 * it (`useToastInset`). Render it only while it has a job: a dirty draft,
 * every step of a stepped form, Apply, a job with a next step. The page under
 * it keeps matching bottom padding, so its last row never hides.
 *
 *   <ActionBar
 *     secondary={<Button variant="secondary" className={actionBarButton} onClick={discard}>Discard</Button>}
 *     primary={<Button className={actionBarButton} onClick={save}>Save</Button>}
 *   />
 *
 * Today this is the job page's bar exactly: full width with the portal's
 * 1200px column, the line under the buttons. The forms build adds the app
 * placement (from the sidebar's edge), ⌘↵ for the primary and hiding while
 * the on-screen keyboard is up, with these props.
 */
export function ActionBar({ status, secondary, primary, error, className }: ActionBarProps) {
  const hasLine = error !== undefined && error !== null && error !== false;
  useToastInset(BAR_PX + (hasLine ? LINE_PX : 0));
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {/* Same width and gutters as the page, so the buttons line up with the content. */}
      {/* 12px between the lines, so a link's 44px touch area (12px past its line) never reaches the buttons. */}
      <div className="mx-auto max-w-300 space-y-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:justify-end">
          {status && <p className="min-w-0 flex-1 truncate text-body text-fg-1">{status}</p>}
          {secondary}
          {primary}
        </div>
        {hasLine && error}
      </div>
    </div>
  );
}
