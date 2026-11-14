import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { firstName } from "@/lib/names";
import { SETUP_STEPS, isSetupStep, nextSetupStep, stepSaved } from "@/lib/contractors/onboarding";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { listTrades, readSetup, readSetupCard, type SetupDoc } from "@/lib/portal/setup";
import type { FileLink } from "@/components/files-list";
import { SetupSteps } from "./setup-steps";

export const metadata: Metadata = { title: "Your Setup" };

const asFiles = (docs: SetupDoc[]): FileLink[] =>
  docs.map((d) => ({ id: d.id, kind: "FILE", filename: d.filename, href: `/api/files/contact/${encodeURIComponent(d.id)}`, size: null, internal: false, createdAt: d.createdAt }));

/**
 * The contractor's setup steps (docs/specs/contractor-onboarding.md, section 3.2), also "Your details and files"
 * in the account menu. Someone staff added has nothing to set up and goes to My jobs. It opens on the step in
 * ?step=, else the next one not saved; someone who finished before starts at Your details, to update anything.
 */
export default async function SetupPage({ searchParams }: PageProps<"/p/setup">) {
  const principal = await requirePortalPrincipal();
  const setup = await readSetup(principal.contactId);
  if (!setup) redirect("/p");
  const { step } = (await searchParams) as { step?: string };
  const [trades, card] = await Promise.all([listTrades(), readSetupCard(principal.contactId)]);

  const start = isSetupStep(step) ? step : setup.setupDoneAt ? SETUP_STEPS[0] : (nextSetupStep(setup.setupStep) ?? "done");

  return (
    <SetupSteps
      contactId={principal.contactId}
      firstName={firstName(setup.fullName)}
      start={start}
      initial={{
        fullName: setup.fullName,
        company: setup.company ?? "",
        phone: setup.phone ?? "",
        mailingAddress: setup.mailingAddress ?? "",
        tradeIds: setup.tradeIds,
        tradesNote: setup.tradesNote ?? "",
        // Nothing is picked until they choose, unless they've saved this step before.
        tenantFixes: stepSaved(setup.setupStep, "trades") ? setup.tenantFixes : null,
        noInsurance: setup.noInsurance,
      }}
      trades={trades}
      openSteps={card?.card?.open ?? []}
      setupDone={!!setup.setupDoneAt}
      w9={asFiles(setup.w9)}
      insurance={asFiles(setup.insurance)}
    />
  );
}
