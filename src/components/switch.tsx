"use client";
import type { ReactNode } from "react";
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components";
import { cn } from "@/lib/utils";

/**
 * A yes or no field (docs/brand-guidelines.md, section 9; selectors 3.10):
 * Escrow, a move-in section's Required, "Create more", the yes or no facets
 * in the Filters sheet. The label sits on the left in `text-body` and the
 * switch on the right; the whole row is the target, 44px tall on touch.
 *
 * A 32 by 18 track with a 12px knob. Off is `--surface` with a `--line-control`
 * edge and knob; on is an `--act` track with an `--on-act` knob, the knob
 * springing across at `--dur-check` since it's a change of state. On React
 * Aria's Switch, so it's a real `role="switch"` with Space and Enter, and with
 * `name` it posts "on" in a form like a checkbox.
 *
 *   <Switch label="Escrow" isSelected={escrow} onChange={setEscrow} />
 */
export function Switch({
  label,
  className,
  ...props
}: Omit<AriaSwitchProps, "children" | "className"> & {
  /** What the switch answers: "Escrow". Also its accessible name. */
  label: ReactNode;
  className?: string;
}) {
  return (
    <AriaSwitch
      {...props}
      className={cn(
        "group flex min-h-8 w-full cursor-default items-center justify-between gap-3 rounded-md text-body text-fg-1 outline-none",
        "pointer-coarse:min-h-11 data-disabled:opacity-50",
        "data-focus-visible:outline-solid data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-act",
        className,
      )}
    >
      <span className="min-w-0 flex-1">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-block h-4.5 w-8 shrink-0 rounded-full border border-line-control bg-surface transition-colors duration-check ease-spring",
          "group-data-selected:border-act group-data-selected:bg-act",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-3 rounded-full bg-line-control transition-[translate,background-color] duration-check ease-spring",
            "group-data-selected:translate-x-3.5 group-data-selected:bg-on-act",
          )}
        />
      </span>
    </AriaSwitch>
  );
}
