import { cn, initials } from "@/lib/utils";

/** Each size, and how many initials fit it at 12px, the floor (nothing goes smaller). */
const SIZES = {
  20: { box: "h-5 w-5", letters: 1 },
  24: { box: "h-6 w-6", letters: 2 },
  28: { box: "h-7 w-7", letters: 2 },
  32: { box: "h-8 w-8", letters: 2 },
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * A person's initials (docs/brand-guidelines.md, section 9): --surface
 * ground, a 1px --line-strong edge and --fg-2 initials at 12px, so it holds
 * on any fill, a highlighted listbox row included. 20px shows one initial;
 * 24px and up show two, so two people who share a first letter stay apart.
 * Never a status tone (STATUS_TONE in status-badge.tsx), so an avatar never
 * reads as a state. Initials come from the name, or the email's local part
 * when there's no name.
 *
 * Team members are round. `outline` marks a contractor, drawn as a rounded-sm
 * square, so who's in-house reads without color (GitHub draws people round
 * and organizations square).
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
  /** A contractor: a rounded-sm square instead of a circle. */
  outline?: boolean;
  className?: string;
}) {
  const { box, letters } = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center bg-surface text-micro font-semibold leading-none tracking-tight text-fg-2 ring-1 ring-inset ring-line-strong",
        outline ? "rounded-sm" : "rounded-full",
        box,
        className,
      )}
    >
      {initials(name, email).slice(0, letters)}
    </span>
  );
}
