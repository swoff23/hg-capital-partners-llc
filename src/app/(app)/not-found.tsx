import { LinkButton } from "@/components/ui";

/**
 * Rendered when a signed-in page calls notFound(): a deal, property, task or
 * contractor id that no longer exists. A plain sentence and one action, flat
 * on the page (docs/brand-guidelines.md, section 9, Empty and payoff states).
 */
export default function AppNotFound() {
  return (
    <div className="max-w-prose py-8">
      <h1 className="text-title text-balance text-fg-1">Not found</h1>
      <p className="mt-1 text-pretty text-body text-fg-2">That record doesn&apos;t exist, or the link is out of date.</p>
      <LinkButton href="/" variant="primary" className="mt-4">
        Go to Home
      </LinkButton>
    </div>
  );
}
