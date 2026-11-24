"use client";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether this visit came from a link a contractor shared with their crew
 * (session.ts `PortalPrincipal.shared`). The portal layout sets it once, so
 * the job page, its loading and error screens and its not-found page all
 * know it before anything draws, with no back arrow flashing in and out.
 * Someone the job was shared with sees that one job and no way to My jobs,
 * which isn't theirs (Connor, Nov 22). A UI hint only: the session's
 * `onlyTaskId` is what keeps them on the job.
 */
const SharedLink = createContext(false);

export function SharedLinkProvider({ shared, children }: { shared: boolean; children: ReactNode }) {
  return <SharedLink.Provider value={shared}>{children}</SharedLink.Provider>;
}

export function useSharedLink(): boolean {
  return useContext(SharedLink);
}

/** Its children, unless this visit came from a shared link: a way to My jobs, for the contractor only. */
export function NotWhenShared({ children }: { children: ReactNode }) {
  return useSharedLink() ? null : children;
}
