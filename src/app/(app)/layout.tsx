import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const jar = await cookies();
  const pinned = jar.get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <AppShell userLabel={user.name ?? user.email} initialPinned={pinned} signOutAction={signOut}>
      {children}
    </AppShell>
  );
}
