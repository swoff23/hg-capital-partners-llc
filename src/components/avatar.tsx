import { cn, initials } from "@/lib/utils";

/** Each size, and how many initials fit it at 12px, the floor (nothing goes smaller). */
const SIZES = {
  20: { box: "h-5 w-5", letters: 1 },
  24: { box: "h-6 w-6", letters: 1 },
  28: { box: "h-7 w-7", letters: 2 },
  32: { box: "h-8 w-8", letters: 2 },
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * A person's initials in a circle (docs/brand-guidelines.md, section 9):
 * --surface ground, a 1px --line-strong edge and --fg-2 initials, so it holds
 * on any fill, a highlighted listbox row included. 20 and 24px show one
 * initial, 28px and up two, always at 12px. Never a status tone
 * (STATUS_TONE in status-badge.tsx), so an avatar never reads as a state.
 * Initials come from the name, or the email's local part when there's no name.
 *
 * `outline` marked a contractor when team avatars were filled. Every avatar
 * now has the edge, so it no longer changes the look; callers still pass it
 * so a contractor mark can come back in one place.
 */
export function Avatar({
  name,
  email,
  size = 24,
  className,
}: {
  name?: string | null;
  email?: string | null;
  size?: AvatarSize;
  /** A contractor. Kept for a future mark; it doesn't change the look today. */
  outline?: boolean;
  className?: string;
}) {
  const { box, letters } = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-surface text-micro font-semibold leading-none tracking-tight text-fg-2 ring-1 ring-inset ring-line-strong",
        box,
        className,
      )}
    >
      {initials(name, email).slice(0, letters)}
    </span>
  );
}
