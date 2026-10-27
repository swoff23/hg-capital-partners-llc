import type { Viewport } from "next";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { readListHrefs } from "@/lib/list-memory";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { AppShell } from "@/components/app-shell";
import { LeaveGuard } from "@/components/leave-guard";
import { RefreshOnReturn } from "@/components/refresh-on-return";
import { UploadQueueProvider } from "@/components/upload-queue";

// Android Chrome resizes the page for its on-screen keyboard, so a sheet's
// footer and a docked composer stay above it with nothing in script; iOS
// ignores this, and useKeyboardInset lifts them there. Here, not in the root
// layout: the portal's fixed bar and the public site keep the default
// (forms 2.9, activity 2.7, build plan conflict 30). It merges with the root
// layout's themeColor.
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

/**
 * Every signed-in page. `LeaveGuard` sits above the shell, so a dirty form
 * sheet, editor or draft holds the back links, tabs, sidebar and Sign out
 * (forms 2.11). `modal` is the slot the create sheets open in over the page
 * (`@modal`, intercepting routes; see its default.tsx). The upload queue sits
 * inside the shell, under its toasts and the guard, so uploads outlive the
 * page that started them and hold Sign out (uploads 2.1).
 */
export default async function AppLayout({ children, modal }: LayoutProps<"/">) {
  const user = await requireUser();
  const jar = await cookies();
  const pinned = jar.get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <LeaveGuard>
      <AppShell
        userName={user.name ?? null}
        userEmail={user.email}
        initialPinned={pinned}
        // Each list's last query, so the sidebar's links open the lists as they were left.
        listHrefs={readListHrefs(jar)}
        signOutAction={signOut}
      >
        <UploadQueueProvider scope={`app:${user.id}`}>
          <RefreshOnReturn />
          {children}
          {modal}
        </UploadQueueProvider>
      </AppShell>
    </LeaveGuard>
  );
}
