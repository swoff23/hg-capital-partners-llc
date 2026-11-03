import "server-only";
import { headers } from "next/headers";
import { isActionRequest } from "./action-request";

/**
 * Whether this render is the refresh that follows a Server Action on the page
 * (its revalidatePath or refresh()), not someone opening it. A record page's
 * after() writes (Recent, the read state) note an open, so they skip this
 * render instead of writing the same rows again for every tick or edit.
 *
 * Next sends the action's request with a `next-action` header and drops it
 * when the action redirects, so a redirect to a page still counts as opening
 * it (createRedirectRenderResult in next/dist/server/app-render/action-handler.js).
 */
export async function isActionRender(): Promise<boolean> {
  return isActionRequest(await headers());
}
