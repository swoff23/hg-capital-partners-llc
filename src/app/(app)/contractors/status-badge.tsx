import { Badge, type BadgeTone } from "@/components/ui";
import { ACCOUNT_STATUS_LABEL, type AccountStatus } from "@/lib/contractors/onboarding";

/**
 * A contractor's status badge: the list's Status column (leading the subline on a phone), and the onboarding
 * badge by the name on the contractor's page (docs/specs/contractor-onboarding.md, 4.1). Badge tones are state
 * (brand guidelines, section 4). New is the one that waits on a partner (Keep or Archive), so it takes warn; no
 * other contractor badge uses warn. Invited, Opened, Onboarding, Active and Access off are plain labels, as the
 * Portal access card's are.
 */
const TONE: Record<AccountStatus, BadgeTone> = {
  new: "warn",
  invited: "neutral",
  opened: "neutral",
  onboarding: "neutral",
  active: "neutral",
  off: "neutral",
};

export function ContractorStatusBadge({ status, className }: { status: AccountStatus; className?: string }) {
  return (
    <Badge tone={TONE[status]} className={className}>
      {ACCOUNT_STATUS_LABEL[status]}
    </Badge>
  );
}
