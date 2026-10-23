"use client";
import { useEffect } from "react";
import { OFFLINE_ERROR, isOfflineError } from "@/lib/action-result";
import { AuthError, AuthFrame, authButtonClass } from "./auth-frame";

/**
 * What the sign-in screens' error boundaries show (app/login/error.tsx and
 * the contractor's first-password page): a submit that never reached the
 * server, or a page that failed, stays in the sign-in frame instead of Next's
 * white error screen. The words are ones the app already uses: the offline
 * line from src/lib/action-result.ts, else the public site's error page line.
 * `retry` loads the page again.
 */
export function AuthCrash({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AuthFrame title="Something went wrong">
      <AuthError>{isOfflineError(error) ? OFFLINE_ERROR : "That page didn’t load. Please try again in a moment."}</AuthError>
      <div className="mt-8">
        <button type="button" onClick={() => retry()} className={authButtonClass}>
          Try again
        </button>
      </div>
    </AuthFrame>
  );
}
