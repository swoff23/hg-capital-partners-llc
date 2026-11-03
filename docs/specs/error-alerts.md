# Error alerts

Planned with Connor on Nov 3, 2026, in two rounds of questions (Q1 to Q12 below). He took every recommendation. Nothing here gets built until Connor says "build it" in chat.

It builds on its own branch after the Nov 3 landing (land-nov3) is live, and before contractors are invited (Q12).

## 1. Summary

**Why.** Nothing tells anyone when the app breaks. The four "Something went wrong" screens (`src/app/(app)/error.tsx`, `src/app/(marketing)/error.tsx`, `src/app/login/error.tsx`, `src/app/(portal)/p/welcome/error.tsx`) are seen only by the person who hit them. Server errors are logged as one JSON line each (`src/lib/log.ts`), so they show up in Vercel's Logs tab and nowhere else. `/api/health` reports the database, but nothing checks it. Once Asana is gone and contractors are on the portal, a broken page or a stuck email queue can go unnoticed for days.

**What changes.**

- **Server errors.** An unexpected server error reaches Sentry, grouped, with the line it came from. Connor gets one email the first time each new kind happens (Q1, Q2, Q3).
- **Browser errors.** These reach Sentry the same way. Sentry's browser package loads after the page is ready, and a tiny catcher holds anything that happens before then (Q6).
- **Site down.** Better Stack checks the site and database every 3 minutes. After 2 misses in a row, Connor gets a phone push and an email, and later an "it's back" notice (Q8).
- **Stopped jobs.** A stopped email job, emails stuck in the queue, or a missed QuickBooks sync reach Connor the same way. Each check stays quiet while its feature is switched off (Q9).
- **Runbook.** A one-page `docs/alerts.md` says what each alert means and what to send Claude (Q10).
- **Screens.** None change. No layout, copy or component on any page moves. There's nothing new to show at 1280, 768 or 375.

**Decisions, as Connor took them.**

| # | Decision |
|---|---|
| Q1 | Cover four kinds: server errors, browser errors, site or database down, and background jobs that quietly stop |
| Q2 | Two free tools: Sentry (1 user, 5,000 errors a month) for errors, and Better Stack (10 site checks every 3 minutes, plus 10 job check-ins) for down and stopped. Not a home-grown error log, and not Vercel's built-in alerts |
| Q3 | Alerts go to Connor only. Down or stopped: phone push plus email, right away. A new kind of error: one email the first time; repeats are grouped and don't email. Everything else waits in Sentry |
| Q4 | What's sent: the error message, the code location, the page address, the area, and staff or contractor by ID. What never leaves the app: form contents, notes, comments, lockbox codes, tenant names or phones, emails, names, cookies and IP addresses. Session replay stays off |
| Q5 | Connor confirms Supabase's daily backups (7 days on Pro) are on. Point-in-time restore is skipped for now |
| Q6 | Sentry's browser package loads after the page is ready, and a tiny catcher holds earlier errors until then. Errors in the first second lose only their click trail |
| Q7 | Only unexpected errors alert: anything that shows people "Something went wrong". Conflicts, field messages and plain refusals ("This job is closed.") never do. Production only. Each error is tagged with its area (staff app, contractor portal, public site) and with staff or contractor |
| Q8 | Better Stack checks `/api/health` (it tests the database) and the public home page every 3 minutes. It alerts after 2 misses in a row (about 6 minutes) and sends a recovery notice |
| Q9 | Stopped means: the email job misses its check-in for 10 minutes; an email is more than 15 minutes past its send time or has failed 3 times; QuickBooks has had no successful sync in 26 hours. Each check is quiet while email or QuickBooks is off |
| Q10 | `docs/alerts.md` covers each alert, what it means and what to send Claude. Every check's description links to it |
| Q11 | Connor creates both accounts on free plans. Sentry goes in through Vercel's integration, which sets its keys, so none pass through chat. Better Stack's check-in links aren't passwords: Connor sends them, and Claude adds them to Vercel after asking |
| Q12 | It's built on its own branch after land-nov3 is live and before contractors are invited, with the full checks and the device check |

## 2. Reuse check

**Reused as is.**

- `src/lib/log.ts` `logError`: the one structured error line. It stays as the Vercel log. Sentry is added next to it, not in its place.
- `src/lib/server-action.ts` `withResult` and `withLog`: every server action already passes through one of these.
- `src/lib/action-result.ts` `userMessage`: it already decides what's expected (ConflictError, FieldError, zod, a plain sentence) and what isn't (it returns `GENERIC_ERROR`). Q7's rule reuses that decision instead of inventing a second one.
- `src/app/api/health/route.ts` and `src/lib/secrets.ts` `healthDetailAllowed`: the site-down check reads the public `{ ok, db }` answer, so it needs no token.
- `NotificationOutbox` (`sendAfter`, `sentAt`, `attempts`, `lastError`) and `QboSyncRun` (`status`, `finishedAt`): the stuck-email and missed-sync checks read these. No schema change.
- `src/lib/env.ts`: the one place `process.env` is read. The new keys go there.

**Extended.**

- **`withResult`.** It reports to Sentry only when `toFailure` would show `GENERIC_ERROR` (Q7). `withLog` reports nothing itself: it rethrows, and Next's `onRequestError` reports the error once.
- **The four `error.tsx` screens.** Each passes the error to the catcher. Their look and copy don't change.
- **`/api/cron/notifications`.** After a run, it pings Better Stack's email check-in, using `after()` so the response isn't held.
- **`env.ts`.** New keys:
  - `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` (set by the integration);
  - `SENTRY_AUTH_TOKEN` (build only, set by the integration; it uploads source maps so error locations are readable);
  - `BETTERSTACK_EMAIL_HEARTBEAT_URL`.

  All are optional: with any one unset, that part does nothing, as Resend works today.

**New.**

- **`src/instrumentation.ts`.** It starts Sentry on the server and exports `onRequestError` (Next 16, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`). Only when `VERCEL_ENV` is production.
- **`src/instrumentation-client.ts`.** The tiny catcher (`window` error and `unhandledrejection`, plus the error screens) buffers errors. It loads Sentry's browser package with a dynamic import once the page is idle, then hands the buffer over (Q6).
- **`src/lib/error-report.ts`.** The scrubber (Sentry's `beforeSend`, on both sides) carries the Q4 rules:
  - drop request bodies, cookies, headers other than the user agent, query strings that carry tokens, and IP addresses;
  - keep only the user's ID and kind;
  - drop any field named after notes, comments, codes, tenants, phones or emails.

  It also adds the area tag from the route path, and it's a pure function with tests.
- **`/api/health/jobs`.** It's token-gated with the existing `HEALTH_TOKEN` (`healthDetailAllowed`). It answers 200, or 503 with short reason codes:
  - `email_stuck`;
  - `email_failing`;
  - `qbo_stale`.

  Each code applies only while that feature is on: email counts as on when `getEnv().email` and `CRON_SECRET` are both set, and QuickBooks counts as on while a connection exists. Better Stack checks it every 3 minutes with the token in a header.
- **`next.config.ts`.** It's wrapped with Sentry's config for source maps. This is checked on the branch first, because Turbopack is Next 16's default and third-party guides report rough edges (risk 1).
- **`docs/alerts.md`.** The runbook (Q10).

## 3. Better Stack setup

Free plan: 10 monitors and 10 heartbeats. This uses 3 and 1.

| Check | What | Alerts after |
|---|---|---|
| Site | `GET /api/health` expects 200 and `"ok":true` | 2 misses (about 6 min) |
| Public site | `GET /` expects 200 | 2 misses |
| Jobs | `GET /api/health/jobs`, `x-health-token` header, expects 200 | 2 misses |
| Email job | Heartbeat pinged by each cron run | 10 min with no ping |

The email heartbeat is created only once email is on (`CRON_SECRET` and Resend set). Until then the cron is refused and never pings, so the heartbeat would alert nonstop.

## 4. Connor's steps

1. **Sentry:** In Vercel, open Integrations, add Sentry, and connect it to the hg-capital-partners-llc-wy7r project. Pick the free Developer plan. It sets the DSN and auth token in the project. Install the Sentry phone app if you want, though email covers new errors.
2. **Better Stack:** Sign up on the free plan with your email, and install the Better Stack phone app for push. Tell Claude when you're in. Claude gives you the exact checks from section 3 and the token header value to paste. Send Claude the email heartbeat link once email is on.
3. **Supabase (Q5):** In the Supabase dashboard for project ywdjaygwkqyrmbdnvaai, open Database, then Backups, and confirm daily backups are listed. Tell Claude what it shows.

## 5. Risks

| Risk | Mitigation |
|---|---|
| 1. Sentry's Next 16 and Turbopack setup has rough edges | Built and run through `npm run test:devices` on the branch before anything lands. If source maps fail, errors still arrive, with unreadable locations, and that's noted in the handoff |
| 2. A loop burns the 5,000-a-month free quota, and later errors go unseen | The catcher sends each distinct error once per page load. Sentry's spike protection stays on. The free plan stops accepting at the cap and never bills |
| 3. Something private leaks into an error message | The scrubber's tests cover each Q4 field. Error messages from our own code never include notes or codes today. The build greps every `throw new Error(` for interpolated record fields |
| 4. An alert storm during a deploy | 2 misses before an alert, and Vercel serves the old deployment until the new one is ready |
| 5. The check-in ping slows the email job | It runs in `after()` with a 3 second timeout, and a failed ping is only logged |

## 6. Later, not now

- A staff banner when emails are delayed. It's a visual change for Connor to approve.
- Pieter as a second recipient.
- A per-business tag on errors if the app is sold to other businesses ([other-businesses-later.md](../other-businesses-later.md)).
- Supabase point-in-time restore.

## 7. References

- [Next.js instrumentation](https://nextjs.org/docs/canary/app/api-reference/file-conventions/instrumentation) and the local copy under `node_modules/next/dist/docs/`.
- Sentry for Next.js: [guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/) and [manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup) (`onRequestError = Sentry.captureRequestError`, `instrumentation-client.ts`).
- Sentry [bundle size guide](https://www.mintlify.com/getsentry/sentry-javascript/guides/best-practices/bundle-size): the base browser package is about 22 KB compressed, and heavy parts can be lazy loaded.
- Sentry free plan: [costbench](https://costbench.com/software/developer-tools/sentry/free-plan/). Check sentry.io/pricing at setup.
- Better Stack free plan: [comparison](https://dev.to/shibley/better-stack-vs-uptimerobot-which-monitoring-tool-is-better-in-2026-97b). Check betterstack.com/pricing at setup.
