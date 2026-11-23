import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GoneJobView } from "@/app/(portal)/p/_components/gone-job";
import { BRAND } from "@/lib/brand";
import { getEnv } from "@/lib/env";
import { goneJobForCrewLink } from "@/lib/portal/gone-job";

export const dynamic = "force-dynamic";
// Absolute, like every outside-facing title (src/app/layout.tsx), so it reads as the job page it replaces did,
// "Job | HG Capital Partners", and never gains the app's " · HG".
export const metadata: Metadata = {
  title: { absolute: `Job | ${BRAND.company}` },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where a crew member's link goes when its job is canceled or deleted, or the contractor is off it (the /j/<token>
 * route sends them here; docs/specs/emails-redesign.md, Q7). A link that isn't in that state goes to sign in, as it did before.
 */
export default async function GonePage({ params }: { params: Promise<{ token: string }> }) {
  if (!getEnv().portalEnabled) notFound();
  const { token } = await params;
  const job = await goneJobForCrewLink(token);
  if (!job) redirect("/login");
  return <GoneJobView job={job} />;
}
