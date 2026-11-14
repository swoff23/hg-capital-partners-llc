import {
  BrowserClient,
  breadcrumbsIntegration,
  captureException,
  dedupeIntegration,
  defaultStackParser,
  eventFiltersIntegration,
  getCurrentScope,
  httpContextIntegration,
  linkedErrorsIntegration,
  makeFetchTransport,
  withScope,
} from "@sentry/browser";
import type { ClientError } from "./client-errors";
import { DATA_COLLECTION, areaOfPath, kindOfArea, scrubBreadcrumb, scrubEvent } from "./error-report";

/**
 * Sentry's browser package, as its own chunk (docs/specs/error-alerts.md,
 * Q20). src/instrumentation-client.ts loads this file with import() once the
 * page is idle; nothing imports it statically (src/lib/client-weight.test.ts).
 * It names only what it uses, because a dynamic import of the whole package
 * would pull all of it in (getsentry/sentry-javascript#11460).
 *
 * A client set up by hand rather than through init(), so the default
 * integrations (sessions, the global handlers, timer wrapping) stay out of the
 * chunk. The catcher in src/lib/client-errors.ts already listens for window
 * errors and unhandled rejections, so Sentry's own handlers would only double
 * them.
 */
export function startBrowserReporting(dsn: string, release: string | undefined): (item: ClientError) => void {
  const client = new BrowserClient({
    dsn,
    release: release || undefined,
    environment: "production",
    dataCollection: DATA_COLLECTION,
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    // No console breadcrumbs: they live in a separate integration that isn't added.
    integrations: [eventFiltersIntegration(), linkedErrorsIntegration(), dedupeIntegration(), httpContextIntegration(), breadcrumbsIntegration({ sentry: false })],
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  getCurrentScope().setClient(client);
  client.init();

  return (item) => {
    const area = item.area ?? areaOfPath(window.location.pathname);
    const kind = kindOfArea(area);
    withScope((scope) => {
      if (area) scope.setTag("area", area);
      if (kind) scope.setTag("kind", kind);
      scope.setTag("source", item.source);
      captureException(item.error);
    });
  };
}
