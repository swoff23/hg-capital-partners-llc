"use client";
import { useContext, useLayoutEffect, useRef, useState, type Ref } from "react";
import {
  Dialog,
  DialogTrigger,
  OverlayTriggerStateContext,
  Popover as AriaPopover,
  PopoverContext,
  useSlottedContext,
  type DialogProps,
  type PopoverProps as AriaPopoverProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";

/**
 * Floating panels built on React Aria (D9): positioning that flips at the
 * viewport edge, outside click and Esc close (one layer per Esc), focus moves
 * in and comes back to the trigger. Styled with our tokens; sized to content.
 *
 *   <PopoverTrigger>
 *     <AriaButton>Due</AriaButton>          // a react-aria-components Button
 *     <Popover aria-label="Due date">{({ close }) => …}</Popover>
 *   </PopoverTrigger>
 *
 * On touch screens, pickers open a Sheet (sheet.tsx) instead.
 */

/** Opens its Popover (or Sheet) from the first pressable child. Re-export of React Aria's DialogTrigger. */
export const PopoverTrigger = DialogTrigger;

/**
 * How a floating surface comes and goes (docs/specs/selectors.md 2, motion
 * per member). "pop" scales in at --dur-base: panels holding anything but a
 * list (the date and repeat panels). "none" appears at once (--dur-0): menus,
 * value lists, Select and the pickers' option lists. Both leave with a
 * --dur-fast fade or pop-out, and reduced motion keeps only the fade.
 */
export type PopoverMotion = "none" | "pop";

const popoverMotion: Record<PopoverMotion, string> = {
  pop: "data-entering:animate-pop-in data-exiting:animate-pop-out motion-reduce:animate-none",
  none: "data-exiting:animate-fade-out motion-reduce:animate-none",
};

/**
 * The floating surface, shared by Popover and Menu: the Float level
 * (docs/brand-guidelines.md, section 5). --popover on a --border edge with the
 * ink float shadow; in dark the edge is --line-strong (--line-float).
 * PopoverSurface's `motion` adds the "pop" or "none" motion.
 */
const popoverFrame = cn(
  "overflow-auto rounded-lg border border-line-float bg-popover text-foreground shadow-float outline-none",
  "data-[placement=bottom]:origin-top data-[placement=top]:origin-bottom",
);

type SurfaceProps = Omit<AriaPopoverProps, "className"> & {
  className?: string;
  /** "pop" (the default) scales in; "none" appears at once, for lists. */
  motion?: PopoverMotion;
  /**
   * "public" puts the public site's dark tokens on the panel
   * (`data-surface="public"`). Inside a PublicSurface the popover portals into
   * the public ground; anywhere else it portals to <body>, outside any public
   * wrapper. The prop stays until this family goes stock
   * (docs/specs/design-foundation.md, section 5.5).
   */
  surface?: "app" | "public";
  /** A panel that fits neither above nor below its trigger opens beside it (the due date panel). */
  besideWhenShort?: boolean;
};

/**
 * Where a popover sits while it stays open (`usePlacement`).
 *
 * It prefers the side it's on. React Aria places it again whenever its
 * content changes size, from the placement it was given, so a panel that
 * opened above its trigger and then swaps in a shorter step (a building's
 * units) would drop below. Preferring the side it's on keeps it there; it
 * still moves when the new content no longer fits on that side (Status
 * opening the visit date panel).
 *
 * With `besideWhenShort`, a panel that fits neither above nor below its
 * trigger as it opens goes beside it instead, where it has the screen's full
 * height: the due date panel under a chip halfway down a laptop screen
 * (Connor, Nov 14). That's decided once, as it opens, so it never jumps
 * sides mid-use.
 */
const VIEWPORT_PAD = 12; // React Aria's containerPadding.

function usePlacement({
  placement,
  offset,
  isOpen,
  triggerRef,
  besideWhenShort,
}: {
  placement: NonNullable<AriaPopoverProps["placement"]>;
  offset: number;
  isOpen: boolean | undefined;
  triggerRef: AriaPopoverProps["triggerRef"] | undefined;
  besideWhenShort: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const state = useContext(OverlayTriggerStateContext);
  const fromTrigger = useSlottedContext(PopoverContext);
  const trigger = triggerRef ?? fromTrigger?.triggerRef;
  const open = isOpen ?? state?.isOpen ?? false;
  const [side, setSide] = useState<"top" | "bottom" | null>(null);
  const [beside, setBeside] = useState(false);
  if (!open && (side || beside)) {
    setSide(null);
    setBeside(false);
  }
  const [axis, align] = placement.split(" ");
  const vertical = axis === "top" || axis === "bottom";

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !vertical || !el) return;
    const read = () => {
      const p = el.getAttribute("data-placement");
      if (p === "top" || p === "bottom") setSide(p);
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(el, { attributes: true, attributeFilter: ["data-placement"] });
    return () => watch.disconnect();
  }, [open, vertical]);

  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = trigger?.current;
    if (!besideWhenShort || !open || beside || !vertical || !el || !anchor) return;
    const check = () => {
      // The panel's own height, uncapped (the popover scrolls; its scrollHeight is the whole panel), plus its border.
      const need = el.scrollHeight + (el.offsetHeight - el.clientHeight);
      const t = anchor.getBoundingClientRect();
      const room = Math.max(t.top, window.innerHeight - t.bottom) - offset - VIEWPORT_PAD;
      if (need > room) setBeside(true);
    };
    // Decided as it opens (and a frame later, once a lazy panel has drawn), never mid-use: a panel that
    // grows after opening (Repeat) stays on its side and scrolls instead of jumping beside.
    check();
    const frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [besideWhenShort, open, beside, vertical, trigger, offset]);

  // Beside, React Aria caps the height from where the panel first sat, and it
  // only places it again when the popover itself changes size. Content that
  // outgrows the cap (Repeat opening) lifts it, so the popover grows, React
  // Aria measures the whole panel and centers it on the trigger again.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !beside || !el) return;
    const watch = new ResizeObserver(() => {
      if (el.scrollHeight > el.clientHeight + 1) el.style.maxHeight = "";
    });
    for (const child of el.children) watch.observe(child);
    return () => watch.disconnect();
  }, [open, beside]);

  const held: AriaPopoverProps["placement"] = beside
    ? "end"
    : side
      ? ((align ? `${side} ${align}` : side) as AriaPopoverProps["placement"])
      : placement;
  return [ref, held] as const;
}

/** A styled React Aria Popover with nothing inside it. For menus and list boxes, which bring their own role. */
export function PopoverSurface({
  className,
  placement = "bottom start",
  offset = 6,
  motion = "pop",
  surface = "app",
  besideWhenShort = false,
  ...props
}: SurfaceProps) {
  const [sideRef, heldPlacement] = usePlacement({ placement, offset, isOpen: props.isOpen, triggerRef: props.triggerRef, besideWhenShort });
  return (
    <AriaPopover
      ref={sideRef as Ref<HTMLDivElement>}
      placement={heldPlacement}
      offset={offset}
      className={cn(popoverFrame, popoverMotion[motion], className)}
      data-surface={surface === "public" ? "public" : undefined}
      {...props}
    />
  );
}

/** A popover holding a dialog: date picks, assignee search, anything that isn't a plain menu. */
export function Popover({
  children,
  className,
  "aria-label": ariaLabel,
  ...props
}: Omit<SurfaceProps, "children"> & { children: DialogProps["children"]; "aria-label": string }) {
  return (
    <PopoverSurface className={className} {...props}>
      <Dialog aria-label={ariaLabel} className="outline-none">
        {children}
      </Dialog>
    </PopoverSurface>
  );
}
