import Link from "next/link";
import { requireUser, authMode } from "@/lib/auth";
import { SideNav } from "@/components/nav";
import { GlobalSearch } from "@/components/global-search";
import { signOut } from "@/app/login/actions";
import { initials } from "@/lib/utils";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface p-3 md:flex">
        <Link href="/" className="px-3 py-2 text-sm font-semibold tracking-tight">
          HG Capital OS
        </Link>
        <div className="mt-3 flex-1">
          <SideNav />
        </div>
        <form action={signOut} className="border-t border-border pt-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
              {initials(user.name ?? user.email)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user.name ?? user.email}</div>
              <button className="text-xs text-muted hover:text-foreground" type="submit">
                Sign out
              </button>
            </div>
          </div>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
          <div className="md:hidden text-sm font-semibold">HG Capital OS</div>
          <GlobalSearch />
          {authMode === "dev" && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
              dev auth
            </span>
          )}
        </header>
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
