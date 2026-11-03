/**
 * Whether a request is a Server Action's: Next marks the POST with the
 * `next-action` header (ACTION_HEADER in next/dist/client/components/app-router-headers.js),
 * and the page render that follows the action in the same request reads the
 * same headers. An open, a prefetch, router.refresh() and the page an action
 * redirects to don't carry it (action-handler.js deletes it before following
 * the redirect).
 */
export function isActionRequest(h: Pick<Headers, "has">): boolean {
  return h.has("next-action");
}
