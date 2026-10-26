"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useToastInset } from "@/components/toast";
import { useKeyboardInset } from "@/components/use-keyboard-inset";
import { shortcutLabel, useModKey } from "@/components/use-platform";
import { Kbd } from "@/components/ui";
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

/**
 * The printed ⌘↵ (Ctrl ↵ off a Mac) at the end of the primary's label, inside
 * the button, toned for the ink fill (no keycap ground); hidden on touch,
 * where there is no keyboard shortcut. Give the button
 * `aria-keyshortcuts="Meta+Enter Control+Enter"`. For a secondary action bar
 * button, print a plain `Kbd` instead.
 */
export function SubmitKeycap() {
  const mod = useModKey();
  return (
    <Kbd tone="act" aria-hidden="true">
      {shortcutLabel(mod, "↵")}
    </Kbd>
  );
}

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
  /**
   * Where it docks. "page" (the default) is the whole screen's width, as the
   * contractor portal draws it. "app" docks to the content column of a
   * signed-in page, from the sidebar's edge to the screen's, with its
   * buttons on the page gutters; the page gets a spacer the bar's height, so
   * the last row and a focused field never hide under it (forms 2.10).
   */
  placement?: "page" | "app";
  /** ⌘↵ (Ctrl ↵) runs this, the primary's action. Ignored while a dialog or sheet has the key. Print the keycap with `<SubmitKeycap />` in the primary. */
  onPrimary?: () => void;
  /**
   * Hide the bar while the on-screen keyboard is up, so it never covers the
   * field being typed in; it comes back when the keyboard closes. On by
   * default for "app", off for "page" (the portal's bar rides above the keyboard).
   */
  hideWithKeyboard?: boolean;
  /**
   * On the bar's width cap, where the buttons' gutters are: the page's own
   * column, so the primary ends where the page's content does ("box-content
   * max-w-300" on Settings, whose column is 1200 wide inside main's padding).
   */
  contentClassName?: string;
  /** On the row of status and buttons itself: narrower than the cap and at its start ("max-w-2xl lg:justify-start"). */
  rowClassName?: string;
  className?: string;
};

const isField = (el: Element | null) => !!el && el.matches("input, textarea, select, [contenteditable]");

/**
 * The tallest the page has been with no field focused, since it loaded. Kept
 * outside the component and recorded from the module's first run, because a
 * bar that appears while the first edit is under way (it mounts when the
 * draft turns dirty, with the keyboard already up) would otherwise never have
 * seen the page without it.
 */
let tallestSeen = 0;
function recordHeight() {
  if (!isField(document.activeElement)) tallestSeen = Math.max(tallestSeen, window.innerHeight);
}
if (typeof window !== "undefined") {
  recordHeight();
  window.addEventListener("resize", recordHeight);
  document.addEventListener("focusout", recordHeight);
}

/**
 * Whether the on-screen keyboard is covering the bottom of a touch screen: an
 * editable field has focus on a coarse pointer and either iOS lifted the
 * visual viewport (`inset`) or Android Chrome shrank the page to less than
 * four fifths of the tallest it has been.
 */
function useKeyboardUp(enabled: boolean): boolean {
  const inset = useKeyboardInset();
  const [editing, setEditing] = useState(false);
  const [short, setShort] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      recordHeight();
      setShort(tallestSeen > 0 && window.innerHeight < tallestSeen * 0.8);
      setEditing(isField(document.activeElement));
    };
    sync();
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    window.addEventListener("resize", sync);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
      window.removeEventListener("resize", sync);
    };
  }, [enabled]);

  const coarse = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(pointer: coarse)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
  return enabled && coarse && editing && (inset > 0 || short);
}

/**
 * The bar docked to the bottom of the screen that holds a page's next step
 * (forms 2.10): the contractor job page's sticky bar (`job-actions.tsx`),
 * made general. On `--canvas` over a `--line` rule, 12px padding plus the
 * safe area, the buttons on the page's gutters, and the toast lifted above
 * it (`useToastInset`). Render it only while it has a job: a dirty draft,
 * every step of a stepped form, Apply, a job with a next step.
 *
 *   <ActionBar
 *     placement="app"
 *     status="3 unsaved changes"
 *     onPrimary={save}
 *     secondary={<Button variant="secondary" className={actionBarButton} onClick={discard}>Discard</Button>}
 *     primary={<Button className={actionBarButton} onClick={save}>Save <SubmitKeycap /></Button>}
 *   />
 *
 * ⌘↵ runs `onPrimary` and the bar sits after the page's content in the Tab
 * order. Below `lg` the buttons share the width; the status shortens to a
 * count, which is the caller's copy. While the on-screen keyboard is up an
 * "app" bar hides (a page's bar is too far from the field to ride the
 * keyboard); a sheet's footer is `FormSheet`'s and does ride it.
 */
export function ActionBar({
  status,
  secondary,
  primary,
  error,
  placement = "page",
  onPrimary,
  hideWithKeyboard,
  contentClassName,
  rowClassName,
  className,
}: ActionBarProps) {
  const app = placement === "app";
  const hasLine = error !== undefined && error !== null && error !== false;
  const keyboardUp = useKeyboardUp(hideWithKeyboard ?? app);
  useToastInset(keyboardUp ? 0 : BAR_PX + (hasLine ? LINE_PX : 0));

  // ⌘↵ runs the primary from anywhere on the page, but not from inside a sheet or dialog, which has its own.
  const run = useRef(onPrimary);
  useEffect(() => {
    run.current = onPrimary;
  });
  useEffect(() => {
    if (!onPrimary) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.isComposing || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      e.preventDefault();
      run.current?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onPrimary]);

  // "app": the content column's left edge, which moves with the sidebar, and a spacer in the page's flow.
  const spacer = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);
  useLayoutEffect(() => {
    if (!app) return;
    const main = spacer.current?.closest("main");
    if (!main) return;
    const measure = () => setLeft(Math.max(0, Math.round(main.getBoundingClientRect().left)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [app]);
  // A focused field scrolls clear of the bar, not under it.
  useEffect(() => {
    if (!app) return;
    const root = document.documentElement;
    root.style.scrollPaddingBottom = `${BAR_PX + 16}px`;
    return () => {
      root.style.removeProperty("scroll-padding-bottom");
    };
  }, [app]);

  return (
    <>
      {app && (
        <div
          ref={spacer}
          aria-hidden="true"
          className="h-[calc(4.5rem+env(safe-area-inset-bottom))] pointer-fine:h-[calc(3.75rem+env(safe-area-inset-bottom))]"
          style={hasLine ? { marginBottom: LINE_PX } : undefined}
        />
      )}
      <div
        className={cn(
          "fixed bottom-0 z-30 border-t border-line bg-canvas pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
          app ? "right-0" : "inset-x-0",
          keyboardUp && "hidden",
          className,
        )}
        style={app ? { left } : undefined}
      >
        {/* Same width and gutters as the page, so the buttons line up with the content. */}
        {/* 12px between the lines, so a link's 44px touch area (12px past its line) never reaches the buttons. */}
        <div
          className={cn(
            "space-y-3 px-4",
            // The app's gutters are main's own (p-4, md:p-6, lg:p-8) and its content sits at the left; the portal's centre.
            app ? "max-w-400 md:px-6 lg:px-8" : "mx-auto max-w-300 sm:px-6 lg:px-8",
            contentClassName,
          )}
        >
          <div className={cn("flex items-center gap-3 lg:justify-end", rowClassName)}>
            {status && <p className="min-w-0 flex-1 truncate text-body text-fg-1">{status}</p>}
            {secondary}
            {primary}
          </div>
          {hasLine && error}
        </div>
      </div>
    </>
  );
}
