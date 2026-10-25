"use client";
import { StatusMark } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/**
 * The round Done checkbox on task rows: the status ring family at 18px
 * inside a 44px hit area (negative margins keep the row compact). To do's
 * empty ring in --fg-3, --fg-1 on hover with a mouse; ticked, Done's filled
 * ring in --ok, with the check spring (docs/brand-guidelines.md, sections 6
 * and 7). The caller owns the state, so a tap shows at once while the save
 * runs.
 */
export function TaskCheckbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The task's title: screen readers hear "Call plumber, checkbox". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group/check -m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-4.5 place-items-center rounded-full group-focus-visible/check:outline-solid group-focus-visible/check:outline-2 group-focus-visible/check:outline-offset-2 group-focus-visible/check:outline-act"
      >
        <StatusMark
          status="OPEN"
          className={cn(
            "col-start-1 row-start-1 size-4.5 transition-colors pointer-coarse:size-4.5",
            checked ? "opacity-0" : "group-hover/check:text-fg-1",
          )}
        />
        {/* Scale 0.9 to 1 on the spring; reduced motion makes it an instant change. */}
        <StatusMark
          status="DONE"
          className={cn(
            "col-start-1 row-start-1 size-4.5 transition-[opacity,scale] duration-check ease-spring pointer-coarse:size-4.5",
            checked ? "scale-100 opacity-100" : "scale-90 opacity-0",
          )}
        />
      </span>
    </button>
  );
}
