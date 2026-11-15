import { Badge, type BadgeTone } from "@/components/ui";
import { ONBOARDING_LABEL, type OnboardingStatus } from "@/lib/contractors/onboarding";

/**
 * The onboarding badge: in the Status column of the list (leading the subline on a phone) and by the name on
 * the contractor's page (docs/specs/contractor-onboarding.md, 4.1). Badge tones are state (brand guidelines,
 * section 4). New is the one that waits on a partner (Keep or Archive), so it takes warn; no other contractor
 * badge uses warn. Invited, Opened and Onboarding are plain
 * labels. Active shows no badge, so there is no tone for it.
 */
const TONE: Record<OnboardingStatus, BadgeTone> = { new: "warn", invited: "neutral", opened: "neutral", onboarding: "neutral" };

export function OnboardingBadge({ status, className }: { status: OnboardingStatus; className?: string }) {
  return (
    <Badge tone={TONE[status]} className={className}>
      {ONBOARDING_LABEL[status]}
    </Badge>
  );
}
