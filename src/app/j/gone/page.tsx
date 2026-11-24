import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GoneJobView } from "@/app/(portal)/p/_components/gone-job";
import { BRAND } from "@/lib/brand";
import { getEnv } from "@/lib/env";
import { goneJobForCrewSession } from "@/lib/portal/gone-job";

export const dynamic = "force-dynamic";
// Absolute, like every outside-facing title (src/app/layout.tsx), so it reads as the job page it replaces did,
// "Job | HG Capital Partners", and never gains the app's " · HG".
export const metadata: Metadata = {
  title: { absolute: `Job | ${BRAND.company}` },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where a crew member who already has the job open lands once it is canceled or deleted, or the contractor is off it
 * (docs/specs/emails-redesign.md, Q7): every portal page sends their session here instead of to sign in
 * (session.ts signedOut). It reads the portal cookie and nothing else, so it says only what that session held. Any
 * other visit goes to sign in, as before. A crew link's own verdict is /j/<token>/gone.
 */
export default async function GoneSessionPage() {
  if (!getEnv().portalEnabled) notFound();
  const job = await goneJobForCrewSession();
  if (!job) redirect("/login");
  return <GoneJobView job={job} />;
}
