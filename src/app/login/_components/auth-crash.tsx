"use client";
import { useEffect } from "react";
import { OFFLINE_ERROR, isOfflineError } from "@/lib/action-result";
import { AuthError, AuthFrame, authButtonClass } from "./auth-frame";

/**
 * What the sign-in screens' error boundaries show (app/login/error.tsx and
 * the contractor's first-password page): a submit that never reached the
 * server, or a page that failed, stays in the sign-in frame instead of Next's
 * white error screen. The title says which: "That didn't go through" for a
 * submit with no connection (the offline line from src/lib/action-result.ts
 * under it), else "That page didn't load", as on the public site.
 * `retry` loads the page again.
 */
export function AuthCrash({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    // Offline, the submit never left the device; otherwise the page itself failed.
    <AuthFrame title={isOfflineError(error) ? "That didn’t go through" : "That page didn’t load"}>
      <AuthError>{isOfflineError(error) ? OFFLINE_ERROR : "Please try again in a moment."}</AuthError>
      <div className="mt-8">
        <button type="button" onClick={() => retry()} className={authButtonClass}>
          Try again
        </button>
      </div>
    </AuthFrame>
  );
}
