import { cookies } from "next/headers";
import { Monogram } from "@/components/monogram";
import { BRAND } from "@/lib/brand";
import { todayYmdEastern } from "@/lib/dates";
import { JOBS_GROUP_COOKIE, firstName, parseJobsGroup, parseJobsTab } from "@/lib/portal/job-view";
import { listMyJobs } from "@/lib/portal/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { readSetupCard } from "@/lib/portal/setup";
import { AccountMenu } from "../_components/account-menu";
import { MyJobs } from "../_components/my-jobs";

// My jobs (docs/asana-migration-plan.md §6, D18, D31). The title comes from the layout.
// A list, so it runs full width to 1600 with the 16 / 24 / 32 gutters (docs/brand-guidelines.md, section 5).
export default async function MyJobsPage({ searchParams }: PageProps<"/p">) {
  const principal = await requirePortalPrincipal();
  const { view } = (await searchParams) as { view?: string };
  const tab = parseJobsTab(view);
  const group = parseJobsGroup((await cookies()).get(JOBS_GROUP_COOKIE)?.value);
  // Someone mid-setup never gets here (session.ts sends them to the steps); `setup` is only for the account menu's
  // "Your details and files", for people who came in by an invite or the sign-up link.
  const [jobs, setup] = await Promise.all([listMyJobs(principal, tab), readSetupCard(principal.contactId)]);

  return (
    <>
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-400 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <span className="flex shrink-0 items-center gap-2 text-label font-semibold text-fg-1">
            <Monogram size={32} />
            {BRAND.portal}
          </span>
          <AccountMenu name={principal.label} email={principal.email} setupLink={setup !== null} />
        </div>
      </header>

      <main className="mx-auto max-w-400 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-4 text-title text-balance text-fg-1">Hi {firstName(principal.label)}</h1>
        <MyJobs jobs={jobs} tab={tab} initialGroup={group} today={todayYmdEastern()} />
      </main>
    </>
  );
}
