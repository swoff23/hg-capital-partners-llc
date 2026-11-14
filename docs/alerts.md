# Alerts

What each alert email means and what to send Claude. Every alert comes from Sentry, on the free plan, to Connor only ([specs/error-alerts.md](specs/error-alerts.md)). Each Sentry check links here.

For any of them, the quickest help is to forward the alert email to Claude, or paste its link.

## Setting up

Once, in Sentry, after the integration is connected. Menu names follow Sentry's docs and may read a little differently on screen.

1. **Privacy.** Settings, then Security & Privacy: turn on "Prevent Storing of IP Addresses". Leave "Data Scrubber" on.
2. **New errors.** Alerts, then Create Alert, then Issues. When: "A new issue is created" or "The issue changes state from resolved to unresolved". If: the event's level is error or higher, and the environment is `production`. Then: send an email to you. Name it "New error".
3. **Site down.** Monitors, then Uptime, then Add Monitor. URL `https://www.hgcapitalpartners.com/api/health` (with www: the bare domain answers with a redirect), method GET, every 1 minute, environment `production`. Alert after 3 failures in a row, and notify you by email.
4. **Background jobs.** Monitors, then Crons. `background-jobs` appears by itself within a minute or two of the first run, with a green check-in each minute. Open it and set its alert to email you. If it hasn't appeared after 10 minutes, tell Claude.

## A new error

**The email:** "New issue" with an error name, the file and line, and a tag for the area: `staff`, `portal`, `public`, `sign-in` or `api`.

**What it means:** something broke that people see as "That page didn't load", "That didn't save" or "We couldn't save that". It can also be a background job's error that people never see, such as a reply by email that didn't post or a QuickBooks sync that failed. Its `scope` tag says which (`email:inbound`, `qbo:sync`, `notifications:reminders`).

You get one email the first time each kind happens. Repeats are grouped under the same issue and don't email again. If you mark it resolved in Sentry and it comes back, you get one more email.

**What to send Claude:** the issue link. If someone read you a code from the error screen, send that too: the screen's code is the issue's `digest` tag.

**Can wait?** Usually a day, unless the area is `portal` and contractors are working, or the scope is a job that sends email.

## The site is down

**The email:** the uptime check for `/api/health` failed 3 times in a row (about 3 minutes).

**What it means:** the app or its database isn't answering. Vercel may be down, a deploy may have broken start-up, or Supabase may be down or out of connections.

**What to do:**

1. Open hgcapitalpartners.com yourself. If it loads, it was a blip, and Sentry closes the issue on the next good check.
2. If it doesn't, send Claude the alert. Claude checks Vercel's latest deploy and runtime errors and Supabase's status, and can roll back to the last good deploy with your OK.

**Can wait?** No. Nobody can use the app while this is open.

## Background jobs stopped

**The email:** the `background-jobs` monitor failed: 5 missed or "error" check-ins in a row (about 5 minutes).

**What it means:** the email job runs every minute and checks in after each run. A miss means the job didn't run or crashed. "Error" means it ran, but one of these is true:

| Reason | What it means |
|---|---|
| `email_stuck` | An email is more than 15 minutes past its send time and hasn't gone |
| `email_failing` | An email has failed 3 times, or gave up after 5 tries in the last day |
| `email_capped` | 100 emails went today, the daily cap. The rest wait for tomorrow. On a normal day that many means something is looping |
| `qbo_stale` | QuickBooks is on and hasn't synced in 26 hours. Check Financials, then Settings: the connection may need a reconnect |

**What to send Claude:** the alert. Claude reads which reason it is from the health check's detail (`/api/health` with the health token, under `jobs`), and Vercel's logs for the job.

**Can wait?** `email_capped` and `email_stuck` mean contractors aren't getting job emails, so look the same day. `qbo_stale` can wait a day.

## Not an alert

- **Resend turned off the reply webhook.** Resend emails its team address after replies keep failing for about a day. The app also reports a failed signature check as a new error (`email:inbound-signature`), which usually means `RESEND_WEBHOOK_SECRET` in Vercel doesn't match Resend's.
- **Warnings in Sentry.** Cleanup that's allowed to fail (an old file left in storage, a "recently viewed" or "seen" mark) is recorded as a warning and never emails.
- **The monthly cap.** The free plan takes 5,000 errors a month. Past that, Sentry drops new ones until the month resets and never bills. If an issue's count is in the thousands, tell Claude: something is looping.
