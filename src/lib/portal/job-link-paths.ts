/**
 * Where a job link goes and what a link session may open
 * (docs/specs/contractor-job-emails.md, section 3). Pure; see
 * job-link-paths.test.ts. The database half is job-links.ts.
 */

/** What a button asks the job page to have ready. Nothing acts until the contractor taps on the page. */
export const JOB_LINK_STEPS = ["done", "photos", "access", "share", "date"] as const;
export type JobLinkStep = (typeof JOB_LINK_STEPS)[number];

export function jobLinkStep(value: string | null | undefined): JobLinkStep | null {
  return JOB_LINK_STEPS.includes(value as JobLinkStep) ? (value as JobLinkStep) : null;
}

/**
 * The job page a link opens, `/p/jobs/<id>`, ready for the button's step:
 *  - done, share and date: `?do=` asks the page to open the Mark done sheet,
 *    the crew text or the date (it opens nothing the job can't take, and asks
 *    before acting);
 *  - access: `#access`, which the page takes to Tenants, or to Lockbox when
 *    nobody lives there (hash-scroll.tsx);
 *  - photos: `#updates`, the Updates section with the composer;
 *  - no step: `#update-<id>` for the update the email opens at.
 * Ids are checked so nothing from the link's query reaches the path unescaped.
 */
export function jobLinkDestination(taskId: string, step: string | null, updateId: string | null = null): string {
  const s = jobLinkStep(step);
  const page = `/p/jobs/${encodeURIComponent(taskId)}`;
  if (s === "done" || s === "share" || s === "date") return `${page}?do=${s}`;
  if (s === "access") return `${page}#access`;
  if (s === "photos") return `${page}#updates`;
  return updateId && /^[A-Za-z0-9_-]{1,64}$/.test(updateId) ? `${page}#update-${updateId}` : page;
}

/**
 * A session a link started opens its one job: the job page and anything
 * under it. Every other portal path (My jobs, another job) sends it to
 * sign in. `path` is the page asked for, as the proxy writes it (path and
 * query, no host).
 */
export function linkSessionMayOpen(path: string | null, onlyTaskId: string): boolean {
  if (!path) return false;
  const job = `/p/jobs/${onlyTaskId}`;
  const bare = path.split(/[?#]/)[0];
  return bare === job || bare.startsWith(`${job}/`);
}

/** A job link's URL: `<origin>/j/<token>`, with `?do=` for a button's step. */
export function jobLinkUrl(appUrl: string, token: string, step: JobLinkStep | null = null, updateId: string | null = null): string {
  const base = `${appUrl.replace(/\/+$/, "")}/j/${token}`;
  const query = new URLSearchParams();
  if (step) query.set("do", step);
  if (updateId) query.set("u", updateId);
  const q = query.toString();
  return q ? `${base}?${q}` : base;
}

/**
 * The statuses a contractor may set or move their scheduled day in: before they start
 * (docs/specs/contractor-scheduled-date.md, Q2; core.ts scheduleByContractor).
 */
export const CONTRACTOR_DATE_STATUSES = ["OPEN", "SCHEDULED", "WAITING"] as const;

export function contractorMaySetDate(status: string): boolean {
  return (CONTRACTOR_DATE_STATUSES as readonly string[]).includes(status);
}
