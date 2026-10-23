import { cn, initials } from "@/lib/utils";

const SIZES = {
  20: "h-5 w-5 text-[9px]",
  24: "h-6 w-6 text-[10px]",
  32: "h-8 w-8 text-xs",
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * A person's initials in a circle. Warm stone neutrals, never a status tone
 * (STATUS_TONE in status-badge.tsx), so an avatar never reads as a state.
 * `outline` marks a contractor: same initials, ringed instead of filled.
 * Initials come from the name, or the email's local part when there's no name.
 */
export function Avatar({
  name,
  email,
  size = 24,
  outline = false,
  className,
}: {
  name?: string | null;
  email?: string | null;
  size?: AvatarSize;
  outline?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none tracking-tight",
        SIZES[size],
        outline
          ? "bg-surface text-stone-600 ring-1 ring-inset ring-stone-300 dark:text-stone-300 dark:ring-stone-600"
          : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-100",
        className,
      )}
    >
      {initials(name, email)}
    </span>
  );
}
