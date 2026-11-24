import { cookies } from "next/headers";
import { todayYmdEastern } from "@/lib/dates";
import { JOBS_GROUP_COOKIE, firstName, parseJobsGroup, parseJobsTab } from "@/lib/portal/job-view";
import { listMyJobs } from "@/lib/portal/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { readSetupCard } from "@/lib/portal/setup";
import { AccountMenu } from "../_components/account-menu";
import { MyJobs } from "../_components/my-jobs";
import { PortalHeader } from "../_components/portal-header";

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
      <PortalHeader account={<AccountMenu name={principal.label} email={principal.email} setupLink={setup !== null} />} />

      <main className="mx-auto max-w-400 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-4 text-title text-balance text-foreground">Hi {firstName(principal.label)}</h1>
        <MyJobs jobs={jobs} tab={tab} initialGroup={group} today={todayYmdEastern()} />
      </main>
    </>
  );
}
