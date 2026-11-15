# Error alerts

Planned with Connor on Nov 3, 2026, in two rounds of questions (Q1 to Q12 below). He took every recommendation. Reviewed on Nov 14 against the code, Vercel's production settings and the tools' current docs (section 8): wrong facts are fixed in place, and Q13 to Q21 are the changes it led to. Connor took every one of those recommendations the same day. Nothing here gets built until Connor says "build it" in chat.

It builds on its own branch. land-nov3 is live and job emails landed on Nov 14, so nothing blocks it. It should land before contractors are invited (Q12).

## 1. Summary

**Why.** Nothing tells anyone when the app breaks.

- **Error screens.** Six error boundaries show a crash only to the person who hit it. `src/app/(app)/error.tsx`, `src/app/(portal)/p/error.tsx` and a job's own `src/app/(portal)/p/jobs/[id]/error.tsx` (under the job page's header, design call 3) render `src/components/error-screen.tsx`. `src/app/login/error.tsx` and `src/app/(portal)/p/welcome/error.tsx` render `src/app/login/_components/auth-crash.tsx`. `src/app/(marketing)/error.tsx` has its own. They say "That page didn't load" or "That didn't save".
- **Server errors.** Each is one JSON line from `src/lib/log.ts`, seen in Vercel's Logs tab and nowhere else. Besides the server action wrappers, 34 places catch an error, log it and carry on, among them a reply by email that didn't post, the 8 am emails, a failed QuickBooks sync and a password reset email that didn't send.
- **Health.** `/api/health` reports the database, but nothing checks it.
- **Email is live.** Since Nov 14 production sends job emails every minute and takes replies by email. With Asana gone and contractors on the portal, a broken page or a stuck email queue could go unnoticed for days.

**What changes.**

- **Server errors.** An unexpected server error reaches Sentry, grouped, with the file and line it came from, including the ones the app catches and only logs today (Q13). Connor gets one email the first time each new kind happens (Q1, Q3).
- **Browser errors.** These reach Sentry the same way. Sentry's browser package loads after the page is ready, and a tiny catcher holds anything that happens before then (Q6, Q20).
- **Site down.** Sentry checks `/api/health`, which tests the database, every minute. After 3 misses in a row (about 3 minutes), Connor gets an email (Q8, Q21).
- **Stopped jobs.** The email job checks in with Sentry after every run: "ok", or "error" when emails are stuck, failing or held by the daily cap, or QuickBooks is on and hasn't synced in 26 hours. Five missed or "error" check-ins in a row (about 5 minutes) alert (Q9, Q14, Q15, Q16).
- **Runbook.** A one-page `docs/alerts.md` says what each alert means and what to send Claude (Q10).
- **Screens.** None change. No layout, copy or component on any page moves. There's nothing new to show at 1280, 768 or 375.

**Decisions, as Connor took them on Nov 3.** Where a Nov 14 decision changes one, its row says so.

| # | Decision |
|---|---|
| Q1 | Cover four kinds: server errors, browser errors, site or database down, and background jobs that quietly stop |
| Q2 | Two free tools: Sentry (1 user, 5,000 errors a month) for errors, and Better Stack (10 site checks every 3 minutes, plus 10 job check-ins) for down and stopped. Not a home-grown error log, and not Vercel's built-in alerts. *Changed by Q21: Sentry alone* |
| Q3 | Alerts go to Connor only. Down or stopped: phone push plus email, right away. A new kind of error: one email the first time; repeats are grouped and don't email. Everything else waits in Sentry. *Neither free plan confirms phone push (section 8), so under Q21 every alert is an email, and the push is Gmail's notification for it* |
| Q4 | What's sent: the error message, the code location, the page address, the area, and staff or contractor by ID. What never leaves the app: form contents, notes, comments, lockbox codes, tenant names or phones, emails, names, cookies and IP addresses. Session replay stays off |
| Q5 | Connor confirms Supabase's daily backups (7 days on Pro) are on. Point-in-time restore is skipped for now |
| Q6 | Sentry's browser package loads after the page is ready, and a tiny catcher holds earlier errors until then. Errors in the first second lose only their click trail |
| Q7 | Only unexpected errors alert: anything that ends on an error screen or on the generic "Couldn't save" line (`GENERIC_ERROR`). Conflicts, field messages and plain refusals ("This job is closed.") never do. Production only. Each error is tagged with its area (staff app, contractor portal, public site) and with staff or contractor |
| Q8 | Better Stack checks `/api/health` (it tests the database) and the public home page every 3 minutes. It alerts after 2 misses in a row (about 6 minutes) and sends a recovery notice. *Changed by Q21: Sentry runs the health check, and the home page check is dropped* |
| Q9 | Stopped means: the email job misses its check-in for 10 minutes; an email is more than 15 minutes past its send time or has failed 3 times; QuickBooks has had no successful sync in 26 hours. Each check is quiet while email or QuickBooks is off. *Q15 sharpens the email rules. Under Q21 a missed check-in alerts after about 5 minutes, not 10, because Sentry counts misses in a row rather than waiting out a long grace period* |
| Q10 | `docs/alerts.md` covers each alert, what it means and what to send Claude. Every check's description links to it |
| Q11 | Connor creates both accounts on free plans. Sentry goes in through Vercel's integration, which sets its keys, so none pass through chat. Better Stack's check-in links aren't passwords: Connor sends them, and Claude adds them to Vercel after asking. *Under Q21 there's one account and no links* |
| Q12 | It's built on its own branch after land-nov3 is live and before contractors are invited, with the full checks and the device check |

**Decisions, as Connor took them on Nov 14.** He took every recommendation from the review. Section 8 says what each one fixes.

| # | Decision |
|---|---|
| Q13 | Report from `logError`, which every caught error already passes through, and not only from `withResult`. Cleanup that's allowed to fail (deleting old files, recent views, "seen" marks) reports as a warning, which never emails |
| Q14 | The jobs check in instead of being polled. Each run of the email job works out the jobs' health and checks in "ok" or "error". This drops the planned `/api/health/jobs` route. The reason behind an "error" shows in `/api/health`'s token-gated detail |
| Q15 | The email rules follow how the queue works. Emails held back by the 100-a-day cap aren't "stuck". Reaching the cap is its own reason, `email_capped`, since 100 in a day most likely means a loop. "Failing" also counts an email that gave up on its fifth try in the last 24 hours, so the alert doesn't clear itself when the email is dropped |
| Q16 | QuickBooks counts as on when its keys and `CRON_SECRET` are set and a connection isn't revoked. Production has no QuickBooks keys today, so that part stays quiet until QuickBooks goes live |
| Q17 | The scrubber sends only an allowlist of extra fields (IDs, counts, kinds) instead of dropping a list of risky names. It also removes the token from one-tap job links (`/j/<token>`) and reset links (`?token=`) in every address, and leaves our own log lines out of the click trail |
| Q18 | An error screen reports only errors that happened in the browser. A server error reaches the screen as a code (its digest) and Sentry already has the full one, so the screen skips it, and the server's report carries the code so it can be looked up. Offline errors never report |
| Q19 | A reply by email that fails its signature check while carrying Resend's signature headers reports once. That means a rotated or mistyped `RESEND_WEBHOOK_SECRET`, and replies would otherwise stop with no sign until Resend gives up on the endpoint |
| Q20 | The browser lazy-loads `@sentry/browser` (about 29 KB compressed) through a one-file wrapper, not `@sentry/nextjs` (about 56 KB). Staff pages are already over their script budget (docs/specs/performance.md), so it stays out of the first load, as Q6 decided |
| Q21 | One tool: Sentry's free plan alone. It now includes one uptime check and one job check-in, which is what this needs. Better Stack's free plan doesn't confirm phone push and is labeled "Free for personal projects". What's lost: an "it's back" email, a second company watching the first, the home page check, and room for more checks without paying |

## 2. Reuse check

**Reused as is.**

- `src/lib/server-action.ts` `withResult` and `withLog`: every server action passes through one of these except seven files: `src/app/login/actions.ts`, `src/app/(portal)/p/actions.ts`, `src/app/join/[token]/actions.ts` and the four `filter-actions.ts`. That's harmless, because what those throw reaches `onRequestError`.
- `src/lib/action-result.ts` `userMessage` and `toFailure`: they already decide what's expected (ConflictError, FieldError, zod, Prisma's number overflow, a plain sentence) and what isn't (`GENERIC_ERROR`). Q7's rule reuses that decision instead of inventing a second one.
- `src/lib/action-result.ts` `isOfflineError`: the error screens already use it, and the catcher skips what it matches (Q18).
- `src/app/api/health/route.ts`: its public `{ ok, db }` answer is a 503 when the database is down, so the uptime check needs no token. `src/lib/secrets.ts` `healthDetailAllowed` already gates the detail that gains the jobs' reasons (Q14).
- `src/lib/notifications/outbox.ts` and `content.ts`: `NotificationOutbox` (`sendAfter`, `sentAt`, `attempts`, `lastError`), `MAX_ATTEMPTS` (5), `DAILY_EMAIL_CAP` (100) and `sentTodayCount`. The email rules read these (Q15). No schema change.
- `QuickbooksConnection` (`status`, `lastSuccessfulSyncAt`): the QuickBooks rule reads these (Q16). No schema change.
- `src/lib/env.ts`: the one place `process.env` is read on the server. `getEnv().email`, `getEnv().qbo` and `CRON_SECRET` already say whether each feature is on.
- The lint rule in `eslint.config.mjs` that keeps `heic-to` out of page bundles: the same rule keeps Sentry's browser package out of them (risk 6).

**Extended.**

- **`src/lib/log.ts` `logError`.** It keeps writing the one JSON line, and also hands the error to a reporter that `src/instrumentation.ts` sets at start-up (Q13). `log.ts` imports nothing from Sentry, so the scripts under `scripts/` that use it are unchanged. A caller can pass `report: false` or `level: "warning"`. Each scope and message reports at most once a minute per server instance.
- **`withResult`.** It reports only when `toFailure` would show `GENERIC_ERROR` (Q7). `withLog` logs without reporting: it rethrows, and Next's `onRequestError` reports the error once.
- **The three error screen components** (`ErrorScreen`, `AuthCrash`, and the public site's `error.tsx`), which cover all six boundaries. Each passes the error to the catcher, which skips errors with a digest and offline errors (Q18). Their look and copy don't change.
- **`/api/cron/notifications`.** After a run it checks in with Sentry, "ok" or "error" from `jobsHealth()` (Q14). The check-in and `Sentry.flush()` run in `after()`, so the response isn't held.
- **`/api/health`.** The token-gated detail gains `jobs`, the reason codes from `jobsHealth()`. The public answer doesn't change.
- **`/api/email/inbound`.** A signature failure with Svix headers present reports once (Q19).
- **`env.ts`.** It reads `NEXT_PUBLIC_SENTRY_DSN`, which the integration sets, for the server. It's optional: unset, nothing reports, as Resend works today. The browser reads the same name as a literal `process.env.NEXT_PUBLIC_SENTRY_DSN` in `src/instrumentation-client.ts`, because `env.ts` parses `process.env` as a whole object, which is empty in the browser, and Next fills in only `NEXT_PUBLIC_` names written out in full. The DSN is public by design. `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are build-only, read by Sentry's config wrapper in `next.config.ts`.

**New.**

- **`src/instrumentation.ts`.** It starts Sentry on the server, sets `logError`'s reporter, and exports `onRequestError` (`Sentry.captureRequestError`), adding the error's digest as a tag (Q18). Only when `VERCEL_ENV` is production, because the integration sets its keys for preview and development too. Next 16 reads it only from `src/`, beside `app` (Next's docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`). Its `request.path` includes the query string, so the scrubber runs on it too.
- **`src/instrumentation-client.ts`.** The tiny catcher (`window` error and `unhandledrejection`, plus the error screens) buffers errors. Once the page is idle it dynamic-imports `src/lib/sentry-browser.ts` and hands the buffer over (Q6, Q20). It sends each distinct error once per page load.
- **`src/lib/sentry-browser.ts`.** It re-exports only what the catcher uses from `@sentry/browser` (`init`, `captureException`, the scope setters). A dynamic import of the whole package pulls in all of it (getsentry/sentry-javascript#11460), so the wrapper keeps the lazy chunk small.
- **`src/lib/error-report.ts`.** The scrubber (Sentry's `beforeSend` and `beforeBreadcrumb`, on both sides) carries the Q4 and Q17 rules:
  - drop request bodies, cookies, headers other than the user agent, and IP addresses;
  - replace the token in `/j/<token>` paths and in `token=` query values, in the page address, the request path, the route name and every breadcrumb;
  - keep only the user's ID and kind;
  - keep extra fields only from an allowlist (IDs, counts, kinds, status codes), so a new field leaks nothing until someone allows it;
  - drop console breadcrumbs, which carry our own log lines and their context.

  It also adds the area tag from the route path. It's a pure function with a test for each Q4 and Q17 rule.
- **`src/lib/jobs-health.ts`.** `jobsHealth(now)` answers `ok` or a list of reason codes:
  - `email_stuck`: an unsent email more than 15 minutes past its send time, while today's count is under the cap;
  - `email_failing`: an unsent email on its third try or later, or one that gave up in the last 24 hours;
  - `email_capped`: today's count has reached `DAILY_EMAIL_CAP`;
  - `qbo_stale`: QuickBooks is on (Q16) and `lastSuccessfulSyncAt` is more than 26 hours old.

  Rows closed without sending ("no recipient", "no task") don't count. Each email rule applies only while email is on, and the QuickBooks rule only while QuickBooks is. It's tested against outbox and connection fixtures.
- **`next.config.ts`.** It's wrapped with Sentry's config for source maps. Turbopack is Next 16's default, so this is checked on the branch first (risk 1).
- **`docs/alerts.md`.** The runbook (Q10).

## 3. Sentry setup

Free Developer plan: 1 user, 5,000 errors a month, 30 days of history, 1 uptime monitor and 1 cron monitor.

**Cost: $0.** The free plan has no card and no pay-as-you-go budget, so past the 5,000 cap Sentry drops events instead of billing. The uptime check adds one small `/api/health` call a minute to Vercel and Supabase, the same rate the email job already runs. It would only cost money if Connor chose one of the upgrades in section 6: a second user, more monitors, or phone push.

| Check | What | Alerts after |
|---|---|---|
| New error | Issue alert "a new issue is created" or "a resolved issue comes back", production only, level error or above (so Q13's warnings never email), email to Connor | The first time each kind happens, and again if it returns after being resolved |
| Site | Uptime monitor: `GET https://www.hgcapitalpartners.com/api/health` every minute (with www: the bare domain answers with a redirect), expects 200 | 3 misses in a row (about 3 minutes) |
| Background jobs | Cron monitor: schedule every minute, 1 minute of margin, `failureIssueThreshold` 5, `recoveryThreshold` 1 | 5 missed or "error" check-ins in a row (about 5 minutes) |

The cron monitor's settings travel with each check-in (`monitorConfig`), and the first check-in created the monitor: confirmed in production on Nov 14, green every minute. Sentry's JavaScript docs don't spell that out, so if the monitor is ever deleted, the next check-in should bring it back; if not, add it by hand with the same settings. Sentry asks for a margin no longer than the schedule, which is why "stopped" is counted in check-ins in a row.

All three alert by email from Sentry; each monitor's own alert setting points at Connor. His phone shows them through Gmail's notifications (section 4).

## 4. Connor's steps

1. **Sentry:** In Vercel, open Integrations, add Sentry, and connect it to the hg-capital-partners-llc-wy7r project. Pick the free Developer plan. It sets the DSN, the org, the project and the auth token in the project, so none pass through chat. If it offers to send Vercel's logs or traces to Sentry, leave that off: it would send every log line, unscrubbed. Claude checks afterward that no log drain was added.
2. **Sentry, once the build is live:** add one uptime monitor with the settings in section 3, and confirm the "new issue" email alert. Claude gives the exact clicks.
3. **Gmail:** make Sentry's alert emails notify on your phone (a filter that marks them important, if Gmail is set to notify only for those).
4. **Resend:** confirm the team email Resend notifies when it turns off a failing webhook is yours.
5. **Supabase (Q5):** In the Supabase dashboard for project ywdjaygwkqyrmbdnvaai, open Database, then Backups, and confirm daily backups are listed. Tell Claude what it shows.

## 5. Risks

| Risk | Mitigation |
|---|---|
| 1. Sentry on Next 16 and Turbopack has rough edges | Source maps upload under Turbopack (SDK 10.13 and up, Next 15.4.1 and up). Function names in stack traces stay minified for now (getsentry/sentry-javascript#18248), while files and lines resolve. That's accepted: turning off minifying to fix it would make every page heavier. All of it is run through `npm run test:devices` on the branch before anything lands |
| 2. A loop burns the 5,000-a-month quota, and later errors go unseen | Past the cap, Sentry drops events until the month resets and never bills. Spike protection isn't confirmed on the free plan, so the guards are ours: `logError` reports each scope and message at most once a minute per instance, the catcher sends each error once per page load, and only production reports |
| 3. Something private leaks into an error message | The scrubber's tests cover each Q4 and Q17 rule. Prisma 6.19 already uses its short error format in production, so its messages name the field, never the value being saved. Error messages from our own code never include notes or codes today, and the build greps every `throw new Error(` for interpolated record fields |
| 4. An alert storm during a deploy | 3 misses before an alert, and Vercel serves the old deployment until the new one is ready |
| 5. The check-in slows the email job | It runs in `after()`, with `Sentry.flush()` capped at 2 seconds |
| 6. A static import pulls Sentry's browser package into every page | The `no-restricted-imports` rule that guards `heic-to` also rejects static imports of `@sentry/browser` and client imports of `@sentry/nextjs`. The device check's script budget would show it too |
| 7. Vercel's crons are best effort: a run can be skipped or run twice | It takes 5 misses in a row to alert, so a skipped minute doesn't, and a second check-in in the same minute is harmless |
| 8. Sentry is the only watcher | If Sentry itself is down, nothing alerts. That's accepted for a free setup; section 6 has the upgrade |

## 6. Later, not now

- A staff banner when emails are delayed. It's a visual change for Connor to approve.
- Pieter as a second recipient. The free plan has 1 user, so this means a paid plan or a shared alert address.
- A per-business tag on errors if the app is sold to other businesses ([other-businesses-later.md](../other-businesses-later.md)).
- Supabase point-in-time restore: about $100 a month for 7 days, and it replaces the daily backups.
- Phone push, SMS or calls for "down": Better Stack's responder seat (about $29 a month) or a paid Sentry plan.
- A `global-error.tsx` for a crash in the root layout, which today falls through to Next's own blank screen. A server-side one already reaches `onRequestError`. Sentry's guide adds this file, but it's a new screen, so it's Connor's call.
- Vercel is moving cron jobs to Schedules, which add up to a minute of jitter on Pro. Five misses in a row already covers it.
- Supabase's backups cover the database only. The app's files are in Vercel Blob, which nothing here backs up.

## 7. References

- Next.js: [instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation) and [instrumentation-client](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client), with local copies under `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/`.
- Sentry for Next.js: [manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/), [source maps](https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/), [crons](https://docs.sentry.io/platforms/javascript/guides/nextjs/crons/), [integrations and lazy loading](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/integrations/).
- Sentry [uptime monitoring](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/) and [issue alerts](https://docs.sentry.io/product/monitors-and-alerts/alerts/create-alerts/).
- Sentry [pricing](https://sentry.io/pricing/) and [quotas](https://docs.sentry.io/pricing/): the free plan's limits, and what happens at the cap.
- Sentry [Vercel integration](https://docs.sentry.io/organization/integrations/deployment/vercel/): the keys it sets.
- Sentry's [11.12.0 release](https://github.com/getsentry/sentry-javascript/releases/tag/11.12.0) for bundle sizes, [#18248](https://github.com/getsentry/sentry-javascript/issues/18248) for function names under Turbopack, [#11460](https://github.com/getsentry/sentry-javascript/issues/11460) for the dynamic import trap.
- Better Stack [pricing](https://betterstack.com/pricing) and [heartbeats](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/), weighed for Q21.
- Vercel [alerts](https://vercel.com/docs/alerts) (Observability Plus only) and [managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) (no retries, best effort).
- Resend [webhook retries](https://resend.com/docs/webhooks/retries-and-replays): 8 tries over about a day, then the endpoint is turned off and the team is emailed.
- Supabase [backups](https://supabase.com/docs/guides/platform/backups) and [point-in-time recovery](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery).

## 8. Nov 14 review

Checked line by line against main at 200093a, Vercel's production settings and the tools' own docs.

**Facts fixed in place.**

- There are five error boundaries, not four: the contractor portal's `src/app/(portal)/p/error.tsx` came in with the land-nov3 fixes. They render through three components, so the catcher hooks into three places.
- No screen says "Something went wrong" any more. Q7's wording names what people see now.
- The QuickBooks rule read `QboSyncRun`. `QuickbooksConnection.lastSuccessfulSyncAt` already holds the answer.
- Email is on in production: `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` and `RESEND_WEBHOOK_SECRET` are set. QuickBooks isn't: production has no QuickBooks keys.
- Sentry's Vercel integration sets `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN`, not `SENTRY_DSN`. It sets them for every environment, and it can also add a log drain.
- The browser can't read the DSN through `env.ts` (section 2, Extended).
- Neither free plan confirms phone push. Better Stack's free plan lists email and Slack alerts, and an App Store review says the free account sends no push. Sentry's free plan alerts by email only. Check both pricing pages at setup.
- Supabase Pro keeps 7 daily backups of the database, not of stored files.

**What the Nov 14 decisions fix.**

- **Q13.** The plan reported only from `withResult` and `onRequestError`. The 34 places that catch an error and carry on reach neither, and they include the jobs that matter most once contractors are on: replies by email, the 8 am emails, the QuickBooks sync, reset emails.
- **Q14.** A polled route needed its own code, tests, token gating, and the health token pasted into a second tool. Checking in from the job is less code and fails safe: if the job crashes before it checks in, the missed check-in alerts.
- **Q15.** As written, "15 minutes past its send time" would fire every day the 100-email cap is hit and stay down until midnight, because held emails keep their send time on purpose. "Failed 3 times" would clear by itself when the fifth try gives up and closes the row, so a dropped email would look like a recovery.
- **Q16.** "A connection exists" would count a sandbox or expired connection while production has no QuickBooks keys and the nightly sync can't run, and alert nonstop.
- **Q17.** One-tap job links carry a working sign-in token in the path, which "query strings that carry tokens" didn't cover. Several `logError` calls pass context such as an email's subject, which Q13 starts sending. A list of risky field names misses those and the next new field, and an allowlist doesn't. Sentry also records console output as breadcrumbs by default, which would carry our log lines.
- **Q18.** In production a server error reaches the browser as "An error occurred in the Server Components render" plus a digest. Passing it on would file one useless issue for every server crash, on top of the real report.
- **Q19.** A wrong webhook secret answers 401 to every reply. Resend retries each one for about a day before it turns the endpoint off and emails the team, so replies could be missing for a day with no sign.
- **Q20.** There's no official way to defer Sentry's Next.js client package. Loading it up front adds about 56 KB compressed to pages already over budget. `@sentry/browser` does the job for errors at about half that. The build's source map step should still cover its chunk, and the branch confirms that a browser error shows a readable file and line.
- **Q21.** Better Stack's two edges were phone push and room for more checks. The free plan doesn't confirm push, and this needs one site check and one job check-in, which Sentry's free plan now includes. One account means one inbox, nothing to paste, and a job monitor created from code. The home page check adds little: if `/api/health` answers, the domain and Vercel are up, and a broken page render is a server error Sentry already reports.

## 9. Build notes (Nov 14)

Built on branch claude/error-monitoring-docs-abc5aa after Connor's "build it". What the build settled, and where it differs from the sections above:

- **Packages.** `@sentry/nextjs` and `@sentry/browser`, both pinned at 11.10.0 (released Oct 28), not the newest 11.12.0 from Nov 10. In this version `withSentryConfig` comes from `@sentry/nextjs/config`.
- **What the SDK collects.** Sentry 11 replaced `sendDefaultPii` with `dataCollection`, and its defaults collect cookies, headers, bodies, query values, database query data and local variables. `DATA_COLLECTION` in `src/lib/error-report.ts` turns every one off on both sides, and the scrubber still runs on what's left.
- **Source maps.** Under Turbopack, Sentry's wrapper turns on public browser source maps and deletes them after uploading. `next.config.ts` makes them only for a production build with `SENTRY_AUTH_TOKEN` set, so until the integration is connected, production serves no source maps.
- **The browser's DSN.** `next.config.ts` passes it as `HG_BROWSER_SENTRY_DSN`, empty outside a production build, with the commit as `HG_BROWSER_RELEASE`.
- **Where the code is.** `src/lib/report-server.ts` is the only file that imports `@sentry/nextjs`, and `src/lib/sentry-browser.ts` the only one that imports `@sentry/browser`. The lint rule and `src/lib/client-weight.test.ts` both hold that. `src/lib/client-errors.ts` is the catcher. `src/lib/jobs-health.ts` holds the rules and `src/lib/jobs-check-in.ts` the check-in. `isOfflineError` moved to `src/lib/offline-error.ts` so the catcher doesn't pull all of `action-result.ts` into every page, and `action-result.ts` re-exports it.
- **Invite links too.** Main's contractor onboarding (merged in before landing) added `/join/<token>` invite and sign-up links, so the scrubber replaces that token as it does `/j/<token>`, and tags `/join` as the portal.
- **Not reported from the browser:** a missing chunk after a deploy, besides offline errors and errors with a digest. The error screen already offers Reload, and it isn't a bug.
- **Warnings, not errors:** removing old files from storage, recent views, "seen" marks, the database pooler notice and the daily cap line. The daily cap already alerts as `email_capped`. Security logs (a failed sign-in, a lockbox view) stay errors.
- **Q4's user ID isn't sent yet.** Every event carries the area and staff or contractor, except on `/`: neither the address nor the route Next 16.3 names (it leaves out the route group) tells the public page from Home, so only the public site's error screen tags it. The ID would need a lookup on each error: the staff session cookie holds an email, which must never leave, and attaching it to Sentry's request scope can't be proven to stay per request on Vercel. Events carry no ID until that's worked out.
- **`email_stuck` reads `sendAfter`** (`src/lib/jobs-health.ts`), which the drain moves: a claim pushes it out by a lease, a failed try by its backoff, and a Resend quota refusal by an hour (`src/lib/notifications/outbox.ts`). So a row Resend keeps refusing never reads as stuck. `firstAt` doesn't move. Noted on Nov 14 by the design-calls merge; not changed there.
- **The runbook** is [docs/alerts.md](../alerts.md). Connor's setup steps are in [docs/todo-for-connor.md](../todo-for-connor.md), under "Turn on error alerts".

- **Checked end to end before landing**, with a local production build pointed at a stand-in Sentry on 127.0.0.1:
  - A crashing page (database unreachable) arrived through `onRequestError` with its area, its digest and the request's user agent, and nothing else from the request.
  - A failed webhook signature arrived once as `email:inbound-signature`; a post without Resend's headers stayed quiet.
  - The job check-in arrived as "error" with the monitor's settings attached, because the local QuickBooks sandbox hadn't synced in 26 hours (`qbo_stale`, also shown in `/api/health`'s detail).
  - Browser errors arrived tagged by area, with the query string dropped and the job link token replaced. A dropped connection didn't report.
  - No test token appeared anywhere in what was sent.
  - Sentry's browser chunk is 25 KB compressed and loaded after the page did; the catcher that ships with every page is 3 KB. The build served no source maps.
  - An error thrown before any of the page's scripts have run isn't caught. No script on the page can catch it.
