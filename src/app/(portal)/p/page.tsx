import { Button, EmptyState, PageHeader } from "@/components/ui";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { signOutPortal } from "./actions";

// Placeholder until My jobs lands (docs/asana-migration-plan.md §6): the
// signed-in contractor, and a sign-out. The title comes from the layout.
export default async function MyJobsPage({ searchParams }: PageProps<"/p">) {
  const principal = await requirePortalPrincipal();
  const { saved } = (await searchParams) as { saved?: string };
  const firstName = principal.label.trim().split(/\s+/)[0] || principal.label;

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 sm:px-6">
        <span className="shrink-0 text-sm font-semibold tracking-tight">HG Jobs</span>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-muted">{principal.label}</span>
          <form action={signOutPortal}>
            <Button type="submit" variant="ghost" className="h-11 sm:h-9">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {saved === "1" && (
          <p role="status" className="mb-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            Password saved. Use it next time you sign in.
          </p>
        )}
        <PageHeader title={`Hi ${firstName}`} />
        <EmptyState>Your jobs will be listed here soon.</EmptyState>
      </main>
    </>
  );
}
