import type { Viewport } from "next";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { readListHrefs } from "@/lib/list-memory";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { AppShell } from "@/components/app-shell";
import { RefreshOnReturn } from "@/components/refresh-on-return";

// Android Chrome resizes the page for its on-screen keyboard, so a sheet's
// footer and a docked composer stay above it with nothing in script; iOS
// ignores this, and useKeyboardInset lifts them there. Here, not in the root
// layout: the portal's fixed bar and the public site keep the default
// (forms 2.9, activity 2.7, build plan conflict 30). It merges with the root
// layout's themeColor.
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const jar = await cookies();
  const pinned = jar.get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <AppShell
      userName={user.name ?? null}
      userEmail={user.email}
      initialPinned={pinned}
      // Each list's last query, so the sidebar's links open the lists as they were left.
      listHrefs={readListHrefs(jar)}
      signOutAction={signOut}
    >
      <RefreshOnReturn />
      {children}
    </AppShell>
  );
}
