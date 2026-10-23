import { cookies } from "next/headers";
import { Monogram } from "@/components/monogram";
import { BRAND } from "@/lib/brand";
import { todayYmdEastern } from "@/lib/dates";
import { JOBS_GROUP_COOKIE, firstName, parseJobsGroup, parseJobsTab } from "@/lib/portal/job-view";
import { listMyJobs } from "@/lib/portal/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { AccountMenu } from "./_components/account-menu";
import { MyJobs } from "./_components/my-jobs";

// My jobs (docs/asana-migration-plan.md §6, D18, D31). The title comes from the layout.
export default async function MyJobsPage({ searchParams }: PageProps<"/p">) {
  const principal = await requirePortalPrincipal();
  const { saved, view } = (await searchParams) as { saved?: string; view?: string };
  const tab = parseJobsTab(view);
  const group = parseJobsGroup((await cookies()).get(JOBS_GROUP_COOKIE)?.value);
  const jobs = await listMyJobs(principal, tab);

  return (
    <>
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex shrink-0 items-center gap-2 text-label font-semibold text-fg-1">
            <Monogram size={32} />
            {BRAND.portal}
          </span>
          <AccountMenu name={principal.label} email={principal.email} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {saved === "1" && (
          <p role="status" className="mb-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            Password saved. Use it next time you sign in.
          </p>
        )}
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Hi {firstName(principal.label)}</h1>
        <MyJobs jobs={jobs} tab={tab} initialGroup={group} today={todayYmdEastern()} />
      </main>
    </>
  );
}
