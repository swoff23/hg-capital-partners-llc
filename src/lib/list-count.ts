import { z } from "zod";
import { MAX_QUERY } from "@/lib/list-memory";

/**
 * The query string a list's count action is asked about (the Filters sheet's
 * "Show 13 tasks"): text no longer than a list would remember. A server
 * action takes whatever a client posts, so the actions check it before they
 * parse it. Server code only; the browser takes ./list-memory, which stays
 * free of zod.
 */
export const countQuery = z.string().max(MAX_QUERY);
