import { attachClientErrorSender, reportClientError, turnOnClientErrors } from "@/lib/client-errors";

/**
 * Error alerts in the browser (docs/specs/error-alerts.md, Q6 and Q20). This
 * runs before hydration on every page, so it stays small: it turns the
 * catcher on, listens for errors, and loads Sentry's browser package only
 * once the page has loaded and gone idle. Errors before then wait in the
 * catcher (src/lib/client-errors.ts).
 *
 * The DSN comes from next.config.ts, filled in only for a production build, so
 * everywhere else this does nothing.
 */

const dsn = process.env.HG_BROWSER_SENTRY_DSN;
const release = process.env.HG_BROWSER_RELEASE;

/** Safari has no requestIdleCallback, so it waits a moment after load instead. */
function whenIdle(run: () => void): void {
  const idle = () => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 5000 });
    else window.setTimeout(run, 2000);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

if (dsn && typeof window !== "undefined") {
  try {
    turnOnClientErrors();
    // Only errors that carry an Error: a cross-origin "Script error." has nothing to read.
    window.addEventListener("error", (event) => {
      if (event.error) reportClientError(event.error, "window");
    });
    window.addEventListener("unhandledrejection", (event) => reportClientError(event.reason, "rejection"));
    whenIdle(() => {
      import("@/lib/sentry-browser")
        .then(({ startBrowserReporting }) => attachClientErrorSender(startBrowserReporting(dsn, release)))
        .catch(() => {
          // Blocked by an ad blocker, or offline: the page works the same without it.
        });
    });
  } catch {
    // Reporting never stops a page from loading.
  }
}
