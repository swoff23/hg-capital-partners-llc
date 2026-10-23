# QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views

Part of the [UI/UX review](README.md). 40 findings: 0 critical, 5 high, 18 medium, 17 low.

## How it should work

QuickBooks go-live becomes one calm integration page inside the merged Settings (D10), plus money views that are honest about how fresh they are.

The page opens like Linear's Slack integration (https://mobbin.com/screens/e64c901c-4ada-4f0a-b3a0-89a6ccf490da): the QuickBooks mark, "HG Capital Partners LLC", one state word with a dot (Connected, Behind, Needs reconnect, Sandbox) and a provenance line, "Connected by Connor on Oct 22 · Updated 6h ago". The state comes from the token and freshness together, so a stalled nightly sync can never read green. Reconnect and Disconnect sit in the state word's menu. A closing card says exactly what disconnecting removes, as Vercel's does (https://mobbin.com/screens/95b9c070-3863-4e9b-8de5-8fb336637b18). Facts follow Mercury's Books Details rows (https://mobbin.com/screens/cc047c78-63c7-4640-a2ce-35f6cee4bba7): a label, a sublabel, the value and Edit. Basis is stated once, and History from is a month you can edit.

Before connecting, one line promises read-only access, as Linear's importer does (https://mobbin.com/screens/6e006032-2235-4b0c-abc8-21ca145393e5). The return from Intuit ends in a toast that names the company, like Vercel's "Connected Git Repository successfully" (https://mobbin.com/screens/156e9938-1514-4396-bfcd-917d05a67665). The first sync runs as Resend's vertical stepper (https://mobbin.com/screens/ca8f9ef0-cc38-4ecb-b3a0-7105098b04e4): Connected, Pulling months, Match properties. Finished steps are tinted and later ones dimmed.

Mapping follows Attio's import review (https://mobbin.com/screens/743c9394-4846-4d21-a8ab-c9ac8729ce60). The QuickBooks class sits on the left and the HG property on the right, with a Needs review group first and each row's lines and dollars beside it. Each row says whether it was set automatically or by a partner, as Mercury's categorization does (https://mobbin.com/screens/b5b9a184-bd88-48e7-ba5a-f3f151278cc2). Selecting rows raises Mercury's floating bar (https://mobbin.com/screens/3380c227-a662-426a-8bcb-70e1d20ba4e1). Every change confirms in a toast with Undo (https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc), and balance-sheet accounts sit behind a type tab.

Sandbox shows Stripe's test-data banner with the go-live action inside it (https://mobbin.com/screens/a71edad2-ab06-4d1f-922a-c7c7bfe75279). An expired token or a new QuickBooks class never hides figures. Instead, one needs-attention row with its action sits above them, as Copilot shows (https://mobbin.com/screens/3590b5a3-966b-42b5-888a-6c39f1243a34).

Populated views read like Mercury Books (https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605): four figures, each with a prior-period line, and categories shown as a label, a share and a slim bar. A period select uses Stripe's presets (https://mobbin.com/screens/266228e3-d7ac-436a-bb53-c0a89ae421af). The monthly chart puts income above a zero line and expenses below it (https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4). Data quality is one sentence in the voice of Mercury's Insights (https://mobbin.com/screens/c2e587ee-46c0-45a2-8030-15b54542e9c4), shown only when something needs action. All 11 properties stay in By property, showing No lines yet or Map instead of vanishing. On a phone the view shows one month at a time with Mercury's stepper (https://mobbin.com/screens/33aa85ec-2765-421d-b954-5ef74b748e81).

<details><summary>What the reviewer covered</summary>

Server on :3200 was up; everything below was captured against it read-only, signed in as Connor.

Live routes:
- /financials/settings plain, ?connected=1, and ?error= with access_denied, state_mismatch, token_exchange_failed and missing_params, each at 1280 and 375. All six render the same page. A text eval confirmed no callback copy anywhere.
- One WebKit 375 shot of ?error=access_denied.
- /financials at 1280, 768 and 375.
- /financials/rent-roll at 1280 and 375.
- /properties/cmtg25y4k0002jphsxww4tv6k (mapped) at 1280 and 375.
- /properties/cmtg25y4p0006jphsv3frndk6 (unmapped) at 1280.
- / (Home) at 1280. Home has no QuickBooks text.
- curl of /api/quickbooks/connect with the session cookie, redirects not followed. It returns a 307 to appcenter.intuit.com with redirect_uri http://localhost:3000/api/quickbooks/callback (the app runs on :3200) and a 600s Secure HttpOnly qbo_oauth_state cookie.
- Signed out, the same route returns a 307 to /login with no return path.
- curl of /api/quickbooks/callback?error=access_denied returns a 307 to /financials/settings?error=access_denied.
- Intuit itself was never opened.

Unreachable states, built by injecting DOM into the live pages using the components' own class strings (script: scratchpad/review/g2a/states.mjs). Each was shot at 1280, 768 and 375, plus dark at 1280:
- Not connected.
- Just connected, first sync running ("never (RUNNING)", empty tables).
- 30 classes after a PARTIAL first sync (5 unmapped, 25 auto).
- EXPIRED on four surfaces: Settings with the Refresh failure text, Overview, Rent roll, and the property card (removed, as financials.tsx:16 does).
- By property with 11 rows plus Unattributed and Portfolio.
- Rent grid at 11 properties by 10 months.
- Property Financials card with 5 expense bars and 5 transactions.
- 320px for the expired Connection card and the populated property card.

Local DB, read with a read-only transaction:
- 1 sandbox connection, 4 classes, 90 accounts, 87 CASH and 123 ACCRUAL lines.
- Sync runs take 8 to 12s for 9 months and 210 lines.
- Every MANUAL run is PARTIAL (NOI off by $2,916).
- The INITIAL run FAILED with a raw "QuickBooks API 400". Two FAILED runs carry "ProfitAndLossDetail dropped columns" errors that the UI never shows.

Code read: the connect, callback and sync routes; settings page, controls, tables and actions; client, config, sync, months, mapping, queries and data-quality; the financials page, rent roll, _components/ui and refresh-button; the property financials.tsx; Prisma models; env.ts; vercel.json.

Go-live walked on paper as Connor: 12 steps, 3 waits and 4 dead ends.
- Waits: the redeploy (about 2 minutes), the first sync (45 to 60s with manual reloads), and possibly the 4 AM cron to finish the newest months.
- Dead end 1: no Connect button while the sandbox row exists.
- Dead end 2: a silent return from Intuit.
- Dead end 3: a capped first sync that Refresh repeats rather than finishes.
- Dead end 4: no sign mapping is done.

Not reached:
- Real Intuit consent and real production volume. The 60s analysis is from code plus sandbox timings.
- A real killed function run.
- The device-check suite (not run, by instruction).

Mobbin: 12 searches (11 screen searches, 1 flow search), web and iOS.

</details>

## Findings

### G2A-004

**Choosing "Ignore" on a class changes nothing: ignored money still counts everywhere**

High · Fix · effort S · `/financials/settings class mapping, Overview, Rent roll, property card` · The QuickBooks mirror is honest about what it covers · quick win

- **Today:** The Role select offers "Ignore" (tables.tsx:14, labels.ts:32), and the schema calls IGNORE "deliberately excluded from every rollup" (prisma/schema.prisma:381). No read path filters it:
- getFinancialsOverview builds Portfolio NOI from every line and puts IGNORE lines into the By property "Unattributed" row (queries.ts:86-99).
- Data quality ignores the role too.

Only the label changes.
- **Why:** At first mapping Connor will Ignore a legacy or test class expecting its money to leave the totals. Portfolio NOI won't move, so the decision silently has no effect.
- **Change:** Exclude classRole IGNORE in loadLines (queries.ts:16) and in the data-quality sums, so Overview, By property, Rent roll and the property card all honor it.
- Picker help text: "Leave out of every total".
- Cleanup list line: "Ignored · $X", so the gap to QuickBooks' own P&L stays explained.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** src/lib/quickbooks/queries.ts loadLines; data-quality.ts.
- **Code:** `src/lib/quickbooks/queries.ts:16-30,86-99`, `prisma/schema.prisma:381`, `src/app/(app)/financials/settings/tables.tsx:14`
- **Verification:** confirmed. Verified. loadLines has no classRole filter (queries.ts:16-30), and toComputeLines drops classRole entirely (queries.ts:32-40), so IGNORE lines count in Portfolio NOI. queries.ts:92-99 puts them in the By property Unattributed row. data-quality.ts:87-96 leaves IGNORE out of the Unattributed tile, so an ignored class makes the two Unattributed figures disagree too (see G2A-011). The only reference to IGNORE outside the picker is the schema comment, "deliberately excluded from every rollup" (schema.prisma:381). A control that silently does nothing to money totals is correctly rated high. getRentRoll needs the same filter.

### G2A-005

**The OAuth return is silent: success, cancel and failure all look the same**

High · Fix · effort S · `/financials/settings after the Intuit round trip` · The QuickBooks mirror is honest about what it covers

- **Today:** The callback redirects to ?connected=1 or ?error=<code> (callback/route.ts:18-23,33-42,79), but settings/page.tsx reads no searchParams.

At 1280, 375 and WebKit 375, all six URLs render byte-for-byte the same page: plain, connected, access_denied, state_mismatch, token_exchange_failed and missing_params. A reload keeps the param in the URL.
- **Why:** Connor can't tell whether the connect worked, whether he cancelled, or whether the link expired. The house rule "Close the loop" fails at the most important moment of go-live.
- **Change:** Read searchParams. Show one quiet line at the top of the QuickBooks section and a toast, then router.replace() to strip the param.

Copy by result:
- connected: "Connected to HG Capital Partners LLC. Syncing Jan to Oct."
- access_denied: "Connection cancelled. Nothing changed."
- state_mismatch: "That sign-in expired. Connect again."
- token_exchange_failed and missing_params: "QuickBooks didn't finish connecting. Try again."

Each error line carries a Connect again button.
- **Desktop, tablet, phone:** 1280 and 768: inline line above the Connection header, toast bottom-right. 375: the toast sits above the bottom bar (D10) and the line wraps to two lines at most.
- **Reuse:** settings/page.tsx; Toast is new (known gap in docs/components.md), anatomy per Mercury and the shadcn Sonner reference.
- **References:** 
  - [Vercel](https://mobbin.com/screens/156e9938-1514-4396-bfcd-917d05a67665): After an OAuth connect, the page shows the connected account row ('Connected just now') and a toast, 'Connected Git Repository successfully'. HG's return should toast 'Connected HG Capital Partners LLC' and show the row in its connected state.
  - [Linear](https://mobbin.com/screens/c7223b87-8318-4848-8453-2ac4b1e1a0a9): The toast pairs a title with one plain line ('Cycles enabled · Cycles are now enabled for the team'). Use this shape for the cancel and failure returns too.
  - [Mercury](https://mobbin.com/screens/74bd2329-ed83-4631-a6ee-6b0688169f3a): "Account linking cancelled" toast: a cancelled consent gets one calm line, nothing else changes.
  - [Steep](https://mobbin.com/screens/c70f80de-5c92-4044-b3b5-b44b819647b9): "Connection failed" with the reason and a single Retry button.
  - [Later](https://mobbin.com/screens/58992f7b-16e7-43db-8d65-1ec4188537e5): Success toast at the top, plus the connected row showing its new status.
  - [Acctual](https://mobbin.com/screens/78868383-2fad-4b4a-a527-5c77e4ca5d18): After the QuickBooks round trip the settings page marks the account 'Connected' and a toast says 'Successfully connected to QuickBooks'.
- **Code:** `src/app/api/quickbooks/callback/route.ts:18-23,33-42,79`, `src/app/(app)/financials/settings/page.tsx:15`, `src/app/api/quickbooks/callback/route.ts:17-35`, `src/app/(app)/financials/settings/page.tsx:15-38`
- **Also found as:** G2A-IV01 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. Reproduced. FinancialsSettingsPage takes no props (page.tsx:15). main innerText was the same 32,643 chars for plain, ?connected=1 and ?error=access_denied (verify-G2A shoot evals). The callback sets these params (callback/route.ts:18-23,79). The Mercury 74bd2329 reference is real (spot-checked: an "Account linking cancelled" toast). The Toast dependency is a listed known gap (docs/components.md:66,138), so it should get a components.md row. The proposed success copy names the company, which needs G2A-016 first.

### G2A-011

**The two "Unattributed" figures will disagree as soon as any class is unmapped**

High · Fix · effort S · `/financials Overview (Unattributed tile vs By property row)` · The QuickBooks mirror is honest about what it covers

- **Today:** The tile and the row already differ on the Accrual view (-$1,904 vs $1,642) because the tile is always Cash basis and also counts non-operating income and debt interest; unmapped and ignored classes would add further divergence.
- **Why:** Two different numbers with the same label on one screen undermine trust in every other figure on the page.
- **Change:** Compute Unattributed once (queries) and show it once (FINANCIALS-041). Split out "Not yet mapped · $X" as its own line linking to the checklist, so unmapped property money isn't presented as company overhead.
- **Desktop, tablet, phone:** No layout change. On phone the row follows FINANCIALS-040's list.
- **Reuse:** src/lib/quickbooks/queries.ts; data-quality.ts.
- **Code:** `src/lib/quickbooks/data-quality.ts:87-95`, `src/lib/quickbooks/queries.ts:92-99`
- **Verification:** partly. Worse than stated: the two figures already disagree today. On /financials?basis=accrual the tile reads "Unattributed (entity / no-class) -$1,904" while the By property row reads "Unattributed $1,642" (verify-G2A/overview-accrual--desktop-light.png and its aria). The tile comes from buildDataQuality, which is always CASH (data-quality.ts:57) and ignores the basis toggle. It also includes NON_OPERATING income and DEBT_INTEREST (data-quality.ts:87-96), while the row is operating NOI only. An unmapped or IGNORE class adds a third difference. Two contradicting numbers with one label on the money page are wrong data, so high. The recommendation (compute once, show once) is right; the basis must be carried into the data-quality strip too.

### G2A-IV02

**Show the first sync running after connect, then land on the mapping step**

High · New capability · effort M · `Financials > Settings right after connecting` · The QuickBooks mirror is honest about what it covers

- **Today:** After a successful connect, the callback starts the first sync in after() and redirects to Settings (callback/route.ts:71-86). Nothing on the page reflects that sync. 'Last successful sync' reads 'never', with at most '(RUNNING)' in 12px muted text. The page never refreshes itself. Overview meanwhile shows $0 KPIs. The run is capped at a 45s budget and can end PARTIAL, finishing on later runs (config.ts:55-56).
- **Why:** This is the payoff moment of go-live, and right now it looks like nothing happened. QuickBooks' own connect shows a progress bar with 'This could take a few minutes.' The house rule asks payoff moments to show what happened and the concrete next step.
- **Change:** While the latest run is RUNNING, replace the Connection facts with one progress row, 'Pulling Jan 2026 to Oct 2026 from QuickBooks', with months done of the planned total, and poll until the run ends. On finish, show the company name, 'Your books are in', and the next step built from the data, for example '2 classes need mapping · Map them', linking to the class table.
- **Desktop, tablet, phone:** Desktop and tablet: inside the Connection card. Phone: the same row at full width, with the range shortened to 'Jan to Oct'.
- **Reuse:** Card and Badge from src/components/ui.tsx; qboSyncRun status and stats; the RefreshButton pending state; line spot art per the payoff rule.
- **References:** 
  - [QuickBooks](https://mobbin.com/screens/c982b511-e484-4f6e-8ec8-e77aa3abc28f): A single progress bar with 'This could take a few minutes.' while the first pull runs.
  - [Acctual](https://mobbin.com/screens/78868383-2fad-4b4a-a527-5c77e4ca5d18): The connected state names the company with a Connected status, confirmed by a toast.
  - [Resend](https://mobbin.com/screens/ca8f9ef0-cc38-4ecb-b3a0-7105098b04e4): A vertical stepper: the finished step is tinted with a check and keeps its value, and the current step holds its actions. Use it for Connected, then Pulling Jan to Oct (4 of 10), then Match properties.
  - [Attio](https://mobbin.com/screens/7f47cc1d-5f9c-4a0e-83b2-a1234ebb3cbf): While work runs in the background, one plain sentence says what is happening and that you can carry on, instead of leaving a blank page.
  - [Salesforce](https://mobbin.com/screens/b3c52fc8-f921-4705-9cfc-fa26d764e856): "We're syncing your account" states what is syncing and when to expect it.
  - [Deel](https://mobbin.com/screens/7b7a9f07-cad9-4c17-807a-d9e2df6f45ac): Integration header carries Connected plus a "Synced: date time" line and a Sync button in one row.
- **Code:** `src/app/api/quickbooks/callback/route.ts:71-86`, `src/app/(app)/financials/settings/page.tsx:88-91`, `src/lib/quickbooks/config.ts:55-56`, `src/lib/quickbooks/sync.ts:441-442`, `src/app/(app)/financials/_components/refresh-button.tsx:25-31`
- **Also found as:** G2A-007 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** verifier-found

### G2A-V01

**The Settings Basis toggle changes nothing anywhere**

High · Fix · effort S · `/financials/settings Basis row (and Overview, Rent roll, property card)` · The QuickBooks mirror is honest about what it covers

- **Today:** Settings shows a Cash | Accrual toggle that writes QuickbooksConnection.accountingMethod (controls.tsx:9-28, actions.ts:108-118). Only the Settings page itself reads it back (settings/page.tsx:56,86). Elsewhere it is ignored:
- Overview and Rent roll read only ?basis= and default to CASH (financials/page.tsx:20, rent-roll/page.tsx:11).
- The property card hard-codes CASH (properties/[id]/financials.tsx:15).

Picking Accrual in Settings leaves every money view on Cash.
- **Why:** The first mapping pass is when Connor picks the company's basis. A setting that silently has no effect undermines trust in the money views, the same failure as G2A-004's Ignore.
- **Change:** Make the stored basis the default everywhere:
- Overview, Rent roll and the property card use conn.accountingMethod when ?basis= is absent.
- The SourceBadge names that basis.
- Overview's "Show accrual basis" link becomes a one-off override for that view.

If Connor would rather have one switch per job, a later design pass can drop the Settings row and keep a single Cash | Accrual segmented control on Overview.
- **Desktop, tablet, phone:** No layout change at 1280, 768 or 375.
- **Reuse:** settings/actions.ts setAccountingMethod; queries.ts getFinancialsOverview, getRentRoll, getPropertyFinancials; SourceBadge.
- **References:** 
  - [Mercury](https://mobbin.com/screens/cc047c78-63c7-4640-a2ce-35f6cee4bba7): Books Details states 'Accounting basis: Cash' as a fact with one sublabel on how to change it, not as a toggle that looks live. HG should state the basis in Settings and keep the working switch on the money views.
- **Code:** `src/app/(app)/financials/settings/controls.tsx:9-28`, `src/app/(app)/financials/settings/actions.ts:108-118`, `src/app/(app)/financials/page.tsx:20`, `src/app/(app)/financials/rent-roll/page.tsx:11`, `src/app/(app)/properties/[id]/financials.tsx:15`, `grep accountingMethod: read only at settings/page.tsx:56,86`, `src/lib/quickbooks/data-quality.ts:57`
- **Also found as:** FINANCIALS-003 (Financials, rent roll and financial settings), G2A-IV04 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** verifier-found

### G2A-001

**A capped full sync keeps the oldest months and drops the newest, and Refresh repeats it**

Medium · Fix · effort M · `QuickBooks sync engine (first sync and Refresh)` · The QuickBooks mirror is honest about what it covers

- **Today:** The latent cap behavior is as described, but it is unlikely on a 10-month go-live sync, since observed runs take about 1s per month. It becomes likely as history grows. Overview flags a capped run with the amber PARTIAL banner (wrong wording). The property card and Rent roll show only "synced Xm ago" with no partial flag.
- **Why:** At go-live the most important numbers, this month and last, are the ones most likely to be missing, and every view labels them as fresh. Stripe and Mercury never present a partial import as current.
- **Change:** Change four things in the sync:
- Run full plans newest month first, and do CASH (the default basis) for every month before ACCRUAL, so Overview is right as early as possible.
- Persist a resume cursor for full runs in QboSyncRun.stats (e.g. fullResumeAt). The next run, auto-chained from the callback's after() or picked up by the nightly cron, continues from there instead of restarting.
- Stamp lastSuccessfulSyncAt only when the whole plan is written.
- Until then, the status line says "Synced Aug to Oct · Jan to Jul still syncing" (see G2A-012).
- **Desktop, tablet, phone:** No layout change. The status line follows G2A-007 at every width.
- **Reuse:** src/lib/quickbooks/months.ts planMonths and src/lib/quickbooks/sync.ts runQuickbooksSync; QboSyncRun.stats already stores months and warnings.
- **References:** 
  - [QuickBooks](https://mobbin.com/screens/c982b511-e484-4f6e-8ec8-e77aa3abc28f): First import is presented as in progress ("This could take a few minutes"), never as done while partial.
- **Code:** `src/lib/quickbooks/sync.ts:393,430-443,466,482`, `src/lib/quickbooks/months.ts:72`, `src/lib/quickbooks/config.ts:56`, `Local QboSyncRun rows: MANUAL runs 8-12s for 9 months and 210 lines`
- **Verification:** partly. Code matches the claim. planMonths full is ascending (months.ts:72). The budget check only runs between months (sync.ts:430-443). sweepCursor keeps prevCursor on a stopped run (sync.ts:466). lastSuccessfulSyncAt is stamped when monthsProcessed > 0 (sync.ts:482). The impact is overstated for go-live day. Local MANUAL full runs took 8 to 12s for 9 months (QboSyncRun), so a 10-month first sync probably fits inside 45s. The risk grows with history, because every manual Refresh is a full rebuild (G2A-014). It also self-heals at the next 4 AM incremental run, which covers the last 3 months plus 4 sweep months. Overview does not call the data fresh: it shows the amber PARTIAL banner, though mislabeled as reconciliation (G2A-012). The property card and Rent roll SourceBadge get no status, so only those two show plain freshness. The recommendation is sound. The QuickBooks c982b511 reference is real: I spot-checked it and it shows a determinate bar with "This could take a few minutes".

### G2A-006

**An expired connection makes the Financials card vanish from all 11 properties**

Medium · Fix · effort S · `/properties/[id] Financials card when QuickBooks is EXPIRED` · The QuickBooks mirror is honest about what it covers

- **Today:** By code (financials.tsx:16, queries.ts:243) the card is omitted when the connection is EXPIRED. The cited screenshots simulate this by deleting the card from the DOM.
- **Why:** Money disappears instead of going stale. Pieter opening a property can't tell "no data" from "QuickBooks needs reconnecting".
- **Change:** Render the card whenever lines exist. Replace the source chip with "Paused · figures as of Oct 14" and a Reconnect button (G2A-008). Keep the totals visible.
- **Desktop, tablet, phone:** 1280: the line sits in the card header. 768: same. 375: the line under the title, with Reconnect as a full-width secondary button at the card's foot.
- **Reuse:** src/app/(app)/properties/[id]/financials.tsx; SourceBadge in financials/_components/ui.tsx.
- **References:** 
  - [Copilot](https://mobbin.com/screens/3590b5a3-966b-42b5-888a-6c39f1243a34): A broken bank connection becomes one 'Connection needing attention' row with a Sign in button above the account list, while every balance below stays on screen.
  - [Xero](https://mobbin.com/screens/d9ddd133-f537-4eb4-a77d-6c8c29995b5d): Figures stay on screen with "Last synced 1 day ago · Refresh now" in the header; staleness is a line, not a missing panel.
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:16`, `src/lib/quickbooks/queries.ts:243`
- **Verification:** partly. The code confirms it: financials.tsx:16 returns null unless data.connected, which is status ACTIVE (queries.ts:243). Overview still renders for EXPIRED (queries.ts:75), so the two views disagree. The cited screenshots are DOM mockups, not captured states: states.mjs removes the card with eval. The claim stands on the code. Severity drops to medium. EXPIRED is a rare state as long as the nightly cron refreshes tokens, and the fix overlaps G2A-008, which already lists the property card as a Reconnect slot. Do them together. The Xero d9ddd133 reference wasn't in my results, but Xero 830b74d7 shows the same "Last synced 1 day ago Refresh now" header pattern.

### G2A-008

**When the connection expires, make Reconnect the action wherever Sync now sits**

Medium · Design change · effort M · `Overview, Rent roll, property card and Settings when QuickBooks is EXPIRED` · The QuickBooks mirror is honest about what it covers

- **Today:** By code, an EXPIRED connection leaves Overview's figures and Refresh button in place; Refresh fails with raw text and the only Reconnect is a text link in Settings. The screenshots of this state are DOM simulations.
- **Why:** The one action that fixes things is hidden. The visible action fails with developer text.
- **Change:** Wherever Sync now lives (Overview header, Rent header, property card, Settings), an expired connection swaps the freshness line and the button.
- Line: "QuickBooks disconnected Oct 14 · figures as of then".
- Button: Reconnect, same size and slot.
- Settings Status becomes "Disconnected", with Reconnect as the primary.
- Home gets one item for both partners through the IA-031 routing. It builds on FINANCIALS-011 and FINANCIALS-047.
- **Desktop, tablet, phone:** 1280 and 768: one row, line left and button right. 375: line on its own row with the button full width beneath; no badge.
- **Reuse:** SourceBadge and RefreshButton in financials/_components; Button.
- **References:** 
  - [Copilot](https://mobbin.com/screens/c249e8cb-67cb-4d06-a431-7b728d51b95d): The connections sheet leads with a '1 NEEDS ATTENTION' group whose row ends in its own Sign in button. Healthy connections follow with 'Linked Aug 19, 2026'.
  - [Copilot](https://mobbin.com/screens/3590b5a3-966b-42b5-888a-6c39f1243a34): The same attention row appears inline on the money view, so Reconnect lives where the data is.
  - [Meetup](https://mobbin.com/screens/9a6077fe-c60a-4d32-8ce4-743766568e57): "Disconnected" state with Reconnect as the only action in that row.
  - [Xero](https://mobbin.com/screens/d9ddd133-f537-4eb4-a77d-6c8c29995b5d): Freshness plus the fix action share one header line.
- **Code:** `src/app/(app)/financials/settings/page.tsx:75-82`, `src/app/(app)/financials/page.tsx:53-63`
- **Verification:** partly. Confirmed by code. Overview keeps rendering when EXPIRED. Its Refresh returns "failed: QuickBooks connection is expired" in 11px muted text (client.ts:42-43 plus refresh-button.tsx:28-29). The only Reconnect is a text link in Settings (page.tsx:77-81). The cited overview, settings and narrow shots are DOM mockups with injected text. The recommendation (swap the button to Reconnect in the same slot) is a good simplification and absorbs G2A-006 and G2A-015 visually. Severity drops to medium because EXPIRED only appears when token refresh lapses, though it becomes likely if CRON_SECRET stays unset in prod. Meetup 9a6077fe was not spot-checked.

### G2A-009

**Turn first-time mapping into a short setup checklist instead of a 7,000px page**

Medium · New capability · effort L · `/financials/settings after the first sync (first-time mapping)` · The QuickBooks mirror is honest about what it covers

- **Today:** Settings is about 1,900px at 1280 because each table scrolls inside a 70vh box. The account table lists all 90 accounts (23 locked balance-sheet accounts, 2 needing a category) inside a nested scroll area. The 30-class state in the cited shots is mocked.
- **Why:** The real job is small: confirm 11 properties, sort a handful of other classes, check a few accounts. A list of 120 controls makes it feel like bookkeeping and gives no payoff when finished.
- **Change:** Add a "Set up Financials" checklist at the top of the QuickBooks settings, mirrored as one line on Overview until done. Each row has a check circle, a count and one button:
- 1. Properties: "9 of 11 matched · Confirm" (G2A-021, G2A-019).
- 2. Other classes: "5 to sort" (overhead, ignore or a property).
- 3. Accounts: "6 need a category" (only unlocked UNCATEGORIZED or OTHER).
- 4. Optional QuickBooks cleanup (FINANCIALS-020).

When everything is done:
- Show the payoff "Financials are ready. Jan to Oct 2026 from HG Capital Partners LLC." with line spot art and "Open Overview".
- Collapse the checklist to "Set up Oct 23".
- Reopen it only when a sync finds something new ("1 new class to map").
- **Desktop, tablet, phone:** 1280: the checklist is a 640px column above the tables. 768: full width. 375: each step is a tappable row that opens its list as a sheet; the tables are hidden on phone until a step is opened.
- **Reuse:** Card, Button, Badge; ConfirmDialog for bulk confirm; new SetupChecklist component (add a row in docs/components.md) based on Stripe's setup guide.
- **References:** 
  - [Resend](https://mobbin.com/screens/ca8f9ef0-cc38-4ecb-b3a0-7105098b04e4): A short vertical setup stepper in place of a long page. Done steps collapse to their result and the next step offers two clear choices.
  - [Linear](https://mobbin.com/screens/07969196-1fee-46e0-85b4-39972001d7fc): 'We found' recap tiles (2 Teams, 3 Users, 15 Issues) before the import starts. HG can recap 'Properties 9 of 11 matched · 5 classes to sort · 6 accounts need a category' at the top of the checklist.
  - [Stripe](https://mobbin.com/screens/032c6d85-93ec-4828-9fe4-8a86a631d654): Setup guide: check circles, one button per step, optional steps marked.
  - [Stripe](https://mobbin.com/screens/92c629f3-bf5a-49a0-9a6a-4cb187cb1b52): Completed checklist state with a single "Continue" link.
  - [Workable](https://mobbin.com/screens/98201cf4-0111-4756-adb0-34b79215e7b4): "Matched 22 fields" banner: auto-matches are summarized, not listed as work.
  - [Klaviyo](https://mobbin.com/screens/b96a383f-2bc1-4f6e-a14c-719300a95679): "Required fields · 5 out of 5 mapped" with a done check per group.
  - [Acorns](https://mobbin.com/screens/c043458e-3f03-4143-a5d0-6528b2a2a04b): Phone payoff: spot art, "Successfully connected", the account row and one Next button.
- **Code:** `src/app/(app)/financials/settings/page.tsx:67-212`
- **Verification:** partly. The "7,000px page" is wrong. Table caps every table at 70vh with its own scroll (ui.tsx:170-179), so Settings is 1,863px tall at 1280 and 2,132px at 375. The account table scrolls 5,118px inside a 467px box on phone, which is a nested-scroll problem rather than a long page. The "about 30 classes, 5 red, 25 auto" figures come from an injected mock; the local sandbox has 4 classes. The real gap is that the account list shows all 90 accounts. That includes 23 balance-sheet accounts locked to Excluded (A/P, A/R, Checking, Visa), while only 2 sit in Uncategorized or Other (local QboAccount). The Stripe 032c6d85 and 92c629f3 references are real (spot-checked). For a one-time job for one person, an L-sized checklist with spot art and a mirrored Overview line is heavy against the simplicity bar. A lighter version may be enough: default each table to the rows that need a decision, with counts and "Show all". This overlaps G2A-021 (Properties step), G2A-019 and G2A-030.

### G2A-010

**Setting Role to Property without picking one hides the class from every warning**

Medium · Fix · effort S · `/financials/settings class mapping (Role select)` · The QuickBooks mirror is honest about what it covers

- **Today:** setClassRole('PROPERTY') leaves propertyId null (actions.ts:38-50). The row then:
- Loses its red "needs mapping" badge (tables.tsx:54).
- Sorts among mapped properties (page.tsx:60-65).
- Escapes the "looks like a property" alarm, which only queries role UNMAPPED (data-quality.ts:96-99).

Its lines are restamped as PROPERTY with no property and fall into Unattributed (queries.ts:93).
- **Why:** A half-finished mapping looks finished, and that property's income quietly lands in overhead.
- **Change:** Treat PROPERTY without a propertyId as unmapped everywhere: the badge, the sort, the alarm and the checklist count. Better still, keep role UNMAPPED server-side until mapClassToProperty sets a property. FINANCIALS-049's single "Maps to" picker removes the state structurally.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** settings/actions.ts setClassRole; data-quality.ts.
- **Code:** `src/app/(app)/financials/settings/actions.ts:38-50`, `src/app/(app)/financials/settings/tables.tsx:54-63`, `src/lib/quickbooks/data-quality.ts:96-99`, `src/lib/quickbooks/queries.ts:93`
- **Verification:** confirmed. Verified. setClassRole keeps propertyId as-is when switching to PROPERTY (actions.ts:45), so UNMAPPED to PROPERTY leaves it null. The red badge shows only for UNMAPPED (tables.tsx:54). The sort ranks PROPERTY above unmapped (page.tsx:60-65). The alarm queries role UNMAPPED only (data-quality.ts:97-99). Restamped lines need propertyId to count per property (queries.ts:93). The Property select does enable in the same row, so most people will finish the second step, which supports medium rather than high.

### G2A-012

**"PARTIAL" means both "months missing" and "doesn't tie"; say which months are missing**

Medium · Fix · effort S · `/financials banner and Settings sync status` · The QuickBooks mirror is honest about what it covers

- **Today:** A run is PARTIAL when it stopped at the time cap or when reconciliation is off (sync.ts:465). Both cases get the same banner, "may be mid-update".

Every local MANUAL run is PARTIAL with all 9 months written, because NOI is off by $2,916. A capped first sync would look identical.
- **Why:** Missing months and an accounting tie-out gap need different actions: wait or sync, versus ask the bookkeeper. One word can't carry both.
- **Change:** When months are missing (stats.months versus monthsProcessed, or a "wall budget" warning), the status line says "Synced Jan to Aug · Sep and Oct sync next". Keep FINANCIALS-051's one-sentence tie gap for the reconciliation case. Never reuse the same banner for both.
- **Desktop, tablet, phone:** One line at 1280 and 768; two lines at most at 375.
- **Reuse:** SourceBadge; QboSyncRun.stats.warnings.
- **References:** 
  - [Mercury](https://mobbin.com/screens/340a46db-da79-4acf-b8bc-f0a0621deed3): Month chips (Jan to Aug) each carry a reconciled mark. The selected month states 'Reconciled Balance $778.90 · Ending Balance $778.90 · Difference: $0.00'. HG can show which months tie and the exact difference for the ones that don't, instead of a single PARTIAL.
  - [Xero](https://mobbin.com/screens/d9ddd133-f537-4eb4-a77d-6c8c29995b5d): Freshness stated in one plain header phrase next to the action.
- **Code:** `src/lib/quickbooks/sync.ts:433,459-466`, `Local QboSyncRun: 7 of 7 recent MANUAL and CRON runs PARTIAL`
- **Verification:** confirmed. Verified. Status is PARTIAL for both a stopped run and a failed tie-out (sync.ts:465). The banner text is "didn't reconcile to the cent, so figures may be mid-update" (financials/page.tsx:66-74), and SourceBadge adds "reconciliation off" (ui.tsx:110). Local MANUAL and CRON runs are all PARTIAL with every month written, and the NOI residual is -$2,916 (stats.reconciliation.CASH.noiVsQbo). The Xero reference pattern (one plain freshness phrase beside the action) matches Xero 830b74d7, which I saw.

### G2A-014

**Every manual Refresh rebuilds all history and is the run most likely to hit the cap**

Medium · Fix · effort S · `Refresh from QuickBooks (Overview and Settings)` · The QuickBooks mirror is honest about what it covers

- **Today:** Each manual Refresh rebuilds every month for both bases; observed runs take 8 to 12s today and grow with history. The existing incremental plan would cover 7 months, not 3.
- **Why:** The usual reason to press Sync is "did today's rent land?". Answering it shouldn't take a minute or risk the G2A-001 cap.
- **Change:** Make Sync now incremental: the last 3 months, about 6 calls, a few seconds. Add "Rebuild all history" to the QuickBooks ⋯ menu for the rare reclass of old months, with a G2A-007 progress line.
- **Desktop, tablet, phone:** Sync now stays a small secondary button at every width; the ⋯ menu holds Rebuild on all sizes.
- **Reuse:** settings/actions.ts syncNow; planMonths("incremental").
- **References:** 
  - [Vercel](https://mobbin.com/screens/b9d9cc23-34a1-434c-a4ed-52a2a4f49bb7): Each run is a row with a status dot and word (Ready, Error) in a fixed column, its duration under the word and a Current chip. HG's sync history can show 'Ready 38s' or 'Error 60s' per run, so a full rebuild hitting the cap is visible.
  - [Render](https://mobbin.com/screens/c5051e6e-518e-4e39-a52e-c2d1865550af): "Manual sync" is a quick action; heavier rebuilds are separate.
- **Code:** `src/app/(app)/financials/settings/actions.ts:120-127`, `src/lib/quickbooks/sync.ts:393`
- **Verification:** partly. Confirmed: MANUAL defaults to scope full (sync.ts:393, actions.ts:120-127). Two numbers are off. Observed manual runs took 8 to 12s, not 45 to 60s. And planMonths("incremental") is the last 3 months plus 4 sweep months, 7 months or about 14 report calls at go-live, not "3 months, about 6 calls". A recent-only scope would be new. The direction is right, since cost grows linearly with history. Medium stands for that trajectory. Render c5051e6e was not spot-checked.

### G2A-015

**Rent roll hides all history on an expired connection and says "Connect" with no button**

Medium · Fix · effort S · `/financials/rent-roll when QuickBooks is EXPIRED` · The QuickBooks mirror is honest about what it covers

- **Today:** getRentRoll returns connected=false when EXPIRED. The page then replaces the whole grid with a dashed "Connect QuickBooks to see the rent roll." (rent-roll/page.tsx:14-22). There is no button, and the wording is wrong, since QuickBooks is connected but expired. Overview on the same tab bar still shows its data.
- **Why:** Rent history Connor already has disappears. The message tells him to do something he can't do from here.
- **Change:** Render the grid with G2A-008's paused line and Reconnect. Reserve the not-connected block (G2A-024, with its button) for when there is no connection at all.
- **Desktop, tablet, phone:** Same as the populated grid at every width; the paused line wraps under the title on phone.
- **Reuse:** rent-roll/page.tsx; SourceBadge.
- **References:** 
  - [Copilot](https://mobbin.com/screens/3590b5a3-966b-42b5-888a-6c39f1243a34): Keep the history on screen and add one attention row with the button that fixes it (Sign in), rather than a 'Connect' sentence with no button.
  - [Meetup](https://mobbin.com/screens/9a6077fe-c60a-4d32-8ce4-743766568e57): Disconnected state keeps the page and offers Reconnect in place.
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:14-22`
- **Verification:** confirmed. Verified in code. `!roll || !roll.connected` swaps the whole grid for an EmptyState with no button (rent-roll/page.tsx:14-22), and connected is false for EXPIRED (queries.ts:345). The cited shots are DOM mocks, but the copy and missing button match the code, and the copy is also what shows when nothing is connected. Overlaps G2A-008 and G2A-024; fix them together.

### G2A-016

**The company name is never fetched, so Settings shows a 16-digit realm ID**

Medium · Fix · effort S · `/financials/settings Connection (Company row)` · The QuickBooks mirror is honest about what it covers

- **Today:** The Company row shows companyName ?? realmId (page.tsx:83), and it renders "9341457820052079". companyName is never written anywhere: it is only read at page.tsx:83 and queries.ts:152.

connectedByUserId is stored but never shown.
- **Why:** At consent Intuit lets Connor pick among companies. Without the name he can't confirm he connected HG's books, and Pieter can't see who set it up.
- **Change:** Fetch the company name in two places:
- Right after exchangeCode in the callback: GET /v3/company/{realm}/companyinfo/{realm}.
- In syncMasterData, to keep it fresh.

Show "HG Capital Partners LLC" with muted "Connected by Connor · Oct 23", and name the company in G2A-005's success line. This builds on FINANCIALS-046's plain connection row.
- **Desktop, tablet, phone:** 1280 and 768: name and muted line on one row. 375: the muted line drops under the name.
- **Reuse:** src/lib/quickbooks/client.ts qboFetch; QuickbooksConnection.companyName and connectedBy.
- **References:** 
  - [Wise](https://mobbin.com/screens/9a1210ff-734d-4e13-8e18-00de06ef3897): The connected-account row shows the QuickBooks mark, the company name ('AS Mobbin') and 'Your QuickBooks account is connected.', with Disconnect on the right. There is no realm ID.
  - [Vercel](https://mobbin.com/screens/c30f5b70-f792-4fb9-8144-ef1844461b1b): Where a technical ID is needed, it sits as a small muted line under the human name ('Neon ID: silent-silence-50112988'), never as the value of Company.
  - [Deel](https://mobbin.com/screens/7b7a9f07-cad9-4c17-807a-d9e2df6f45ac): "Workspace: JDMob" names the connected account under the integration title.
  - [Lyssna](https://mobbin.com/screens/2acb84dd-ebd3-4574-8ce8-c7a1c477c78e): "Connected on May 14, 2024" shown quietly on the integration row.
- **Code:** `src/app/(app)/financials/settings/page.tsx:83`, `src/lib/quickbooks/queries.ts:152`, `src/app/api/quickbooks/callback/route.ts:44-69`, `prisma/schema.prisma:448`
- **Also found as:** G2A-IV03 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. Seen live: Company reads 9341457820052079 (verify-G2A/settings--desktop-light.png). companyName has no writer anywhere in src (grep: only reads at page.tsx:83 and queries.ts:152). connectedByUserId is written (callback/route.ts:56,66) and never shown.

### G2A-021

**Map by property (11 rows), not by class (30 rows with three selects each)**

Medium · Design change · effort M · `/financials/settings class mapping (first-time mapping view)` · The QuickBooks mirror is honest about what it covers

- **Today:** The table lists every class with three selects: Role, Property and Entity.
- A refinanced property appears twice ("HGC 118 Congress" and "HG2 118 Congress").
- The Property select offers all 11 addresses, including ones already mapped.
- The Entity select repeats what the class prefix says, and no view reads entityId.
- At 375 the selects collapse to about 40px with no visible value.
- **Why:** Connor thinks "which class is 767 Prospect?", not "what role is HG1:HG1 Lafayette?". The question also reveals a property with no class at all.
- **Change:** Properties step (G2A-009): 11 rows, one per property ("767 Prospect Ave").
- Each row shows its mapped classes as chips ("HGC 767 Prospect", "HG2 767 Prospect").
- A property with no class shows a picker limited to unmatched classes, with likely matches first.

Below: "Other classes", each with one choice (Company overhead, Ignore, or a property).

Derive Entity from the prefix as muted text and drop it as a control. FINANCIALS-049's single picker remains the edit control for the full table.
- **Desktop, tablet, phone:** 1280: two-column rows (property, chips plus menu). 768: same, chips wrap. 375: one row per property; tapping opens a sheet listing candidate classes. This replaces FINANCIALS-022's phone rows for first-time setup.
- **Reuse:** New PropertyClassMap view beside settings/tables.tsx; Badge for chips; menu via React Aria (approved).
- **References:** 
  - [Attio](https://mobbin.com/screens/743c9394-4846-4d21-a8ab-c9ac8729ce60): Raw value on the left, an arrow, the mapped value on the right, a 'Needs review 3' group first and a row count per value. Use it for QuickBooks class to HG property, with one picker per row instead of three selects.
  - [Attio](https://mobbin.com/screens/683a5479-19e0-4881-84cd-312a1f9d187a): A left list marks only the items that still need review with a small dot, so the remaining work is visible at a glance.
  - [Rox](https://mobbin.com/screens/7bd84fc8-4585-4367-b1df-27c5935787ce): Source to target pairs shown as chips with an arrow and a per-pair check.
  - [Klaviyo](https://mobbin.com/screens/b96a383f-2bc1-4f6e-a14c-719300a95679): Required versus optional groups, each with an "N of N mapped" count.
  - [Salesforce](https://mobbin.com/screens/a037f8f5-9fa8-41a8-b6a2-3af21fc2e097): "20 fields found and 20 fields matched" header over one picker per row with a preview column.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:38-106`
- **Verification:** confirmed. Verified at 375. Role selects render 40px wide showing one glyph ("I", "("), with widths 40/80/58/40px (verify-G2A/settings-classes--cls--mobile-light.png). entityId is written by sync but read by no view (grep). The duplicate HGC/HG2 classes are from the mock, but the rent roll copy already expects several classes per property after a refinance. Property-first mapping is the right frame. It is G2A-009's step 1, so keep the two together.

### G2A-022

**Show recent syncs with a plain reason when one fails**

Medium · New capability · effort M · `/financials/settings (sync status and failures)` · The QuickBooks mirror is honest about what it covers

- **Today:** Settings shows only "(FAILED)" or "(PARTIAL)" beside the last successful date (page.tsx:88-91). QboSyncRun.error and stats.warnings are stored but never shown.

Locally:
- The INITIAL run failed with "QuickBooks API 400 ... Error processing query".
- Two runs failed with "ProfitAndLossDetail dropped columns ...".

No nightly schedule is mentioned anywhere.
- **Why:** When numbers look off, Connor needs to see what ran, when, and why it failed, without opening logs. Stripe and Render keep a short run history.
- **Change:** Add a "Recent syncs" list of the last 5 runs. Each row: when, Nightly/Manual/First, "Jan to Oct", "4,812 lines", "38s", and a result word.
- A failed row expands to one plain sentence ("QuickBooks rejected a report request. We'll retry tonight.") with the raw error behind "Details".
- Footer: "Next sync tonight around 4 AM".
- **Desktop, tablet, phone:** 1280 and 768: a compact 5-row table. 375: two-line rows (when and result on top, months and lines muted below); Details opens a sheet.
- **Reuse:** Table, Th, Td; Badge for the result word; QboSyncRun.
- **References:** 
  - [Vercel](https://mobbin.com/screens/b9d9cc23-34a1-434c-a4ed-52a2a4f49bb7): Run history as rows with a status dot and word plus the duration in fixed columns, filterable by status.
  - [Linear](https://mobbin.com/screens/1ebd913e-e767-4db0-b689-35cbf78f8b3d): Past imports collapse to one row ('1 import · Details') in settings, so the history is there without taking space.
  - [Render](https://mobbin.com/screens/c5051e6e-518e-4e39-a52e-c2d1865550af): Sync history rows with a status check and relative time, next to "Manual sync".
  - [Deel](https://mobbin.com/screens/7b7a9f07-cad9-4c17-807a-d9e2df6f45ac): Sync problem stated in one sentence with a single fix action.
- **Code:** `src/app/(app)/financials/settings/page.tsx:88-91`, `prisma/schema.prisma:631-648`, `Local QboSyncRun: INITIAL FAILED "QuickBooks API 400", MANUAL FAILED "ProfitAndLossDetail dropped columns"`
- **Verification:** confirmed. Verified. QboSyncRun.error and stats.warnings are never rendered; Settings shows only the status word (page.tsx:88-91). Local runs failed with "QuickBooks API 400 ... QueryProcessingError" and "ProfitAndLossDetail dropped columns". The cron is 0 8 * * * UTC, 4 AM Eastern (vercel.json), so "tonight around 4 AM" is right. Ship the one-sentence failure reason in the status line first; the 5-row history is optional and should stay compact.

### G2A-024

**Give "not connected" one real block instead of three different dashed boxes**

Medium · Design change · effort S · `/financials, /financials/rent-roll, /financials/settings when not connected` · The QuickBooks mirror is honest about what it covers

- **Today:** Each surface handles "not connected" differently:
- Settings and Overview: a dashed EmptyState, "QuickBooks isn't connected.", then a lone primary button.
- Rent roll: different copy and no button.
- Property cards: render nothing.

Nothing says what connecting does, that it is read-only, or that Intuit sign-in comes next.
- **Why:** This is the first impression of the money side of the app. A dashed box reads as unfinished, and Rent roll gives no way forward.
- **Change:** Build one shared NotConnected block for all three tabs:
- QuickBooks mark and heading "Connect QuickBooks".
- One line: "See P&L and rent by property. Read-only, nothing changes in QuickBooks."
- G2A-023's history picker.
- The primary button, with muted text: "You'll sign in at Intuit and pick the company."

No dashed border; a plain card. FINANCIALS-067 keeps env names out of it.
- **Desktop, tablet, phone:** 1280 and 768: a 480px block left-aligned in the content. 375: full width, button full width.
- **Reuse:** Card, LinkButton; replaces EmptyState here; new NotConnected in financials/_components.
- **References:** 
  - [Linear](https://mobbin.com/screens/6e006032-2235-4b0c-abc8-21ca145393e5): The pre-connect card says plainly that importing 'will not affect issue data in the workspace you import from'. HG's connect block needs one such line: 'HG reads QuickBooks and never writes to it.'
  - [Mercury](https://mobbin.com/screens/cb40503d-fd6c-437c-bbba-aaec53ce22f3): Connected and available integrations share one list, each row carrying a one-line purpose and its state.
  - [QuickBooks](https://mobbin.com/flows/33335881-eb02-42b4-8250-205e9c460c9c): Empty state opens with a short promise and numbered steps before "Connect account".
- **Code:** `src/app/(app)/financials/page.tsx:23-44`, `src/app/(app)/financials/rent-roll/page.tsx:14-22`
- **Verification:** confirmed. Verified in code. Overview and Settings use a dashed EmptyState plus a button (financials/page.tsx:23-44, settings/page.tsx:18-38). Overview's not-configured branch prints four env var names. Rent roll has different copy and no button (rent-roll/page.tsx:14-22). The property card returns null (financials.tsx:16). Drop the G2A-023 history picker from the block. A full-color QuickBooks logo would break the house rule of single-color line icons in the app, so use a line icon or none, or name that rule in conflicts_with.

### G2A-I02

**Status reads ACTIVE in green 51 days after the last sync**

Medium · Fix · effort S · `Financials > Settings, Connection card; SourceBadge on every money view` · The QuickBooks mirror is honest about what it covers

- **Today:** Settings shows the token status as a raw uppercase enum 'ACTIVE' in green, and the stale date sits two rows below it with '(PARTIAL)' in 12px muted text. Overview's source chip goes amber for the same data, so the two screens disagree on tone, not on the facts shown.
- **Why:** Two screens disagree about one connection, and the one that's meant to be authoritative says all is well. For a read-only mirror, freshness is the trust signal. Vercel puts one status dot and word on each run, and Copilot prints '4 hours ago' beside each linked account, so staleness can't hide behind a green chip.
- **Change:** Derive one state from the token and freshness together, in a single helper used by both the Settings card and the source line on money views. Connected: a sync succeeded in the last 36 hours. Behind: no success in 36 hours, with one line under it, 'Last synced Sep 2. The nightly sync hasn't run since.' Needs reconnect: the token expired. Behind uses the amber Badge tone, and it's the only amber on the card.
- **Desktop, tablet, phone:** The same state word appears at every size. On phone the reason line wraps under the state word.
- **Reuse:** Badge tones in src/components/ui.tsx; move hoursSince and the SourceBadge tone logic from financials/_components/ui.tsx into a shared helper.
- **References:** 
  - [Vercel](https://mobbin.com/screens/b9d9cc23-34a1-434c-a4ed-52a2a4f49bb7): Status is a dot plus a word (Ready, Error) in a fixed column, one state per row.
  - [Copilot](https://mobbin.com/screens/2bb59fe5-98a2-4506-8045-8633888d7eda): The connection detail shows 'Linked August 19, 2026' and the account's freshness ('4 hours ago') right under its name.
- **Code:** `src/app/(app)/financials/settings/page.tsx:76`, `src/app/(app)/financials/_components/ui.tsx:103-105`, `src/app/api/quickbooks/sync/route.ts:21-27`, `vercel.json`
- **Verification:** partly. Reproduced: green 'ACTIVE' badge, with 'Last successful sync Sep 2, 2026 (PARTIAL)' two rows below, while Overview's chip is amber 'synced 51d ago'. The badge tone depends only on conn.status (settings/page.tsx:76). Cron route returns 503 without CRON_SECRET (sync/route.ts:21-27), which matters at go-live if that secret is still unset. Calibrated to medium: the staleness is visible on Overview and in the same card's date row, so this is a consistency and trust gap rather than hidden data. The 51 days here is a local DB that isn't syncing. The proposed Connected / Behind / Needs reconnect states change tones and copy, so it sits closer to design than a pure fix. Vercel and Copilot references not spot-checked.

### G2A-I04

**Let Connor pull earlier history from Settings instead of an env variable**

Medium · New capability · effort M · `Financials > Settings, Connection card` · The QuickBooks mirror is honest about what it covers

- **Today:** 'History from' shows the raw key '2026-01' and can't be changed in the app. Editing QBO_HISTORY_START and redeploying doesn't change it either, because the value is copied onto the connection only when the row is first created. Today the only way to pull earlier months is Disconnect, Delete everything, then reconnect, which also wipes every mapping.
- **Why:** At go-live the production company has years of books, and last year is what NOI gets compared against. Today changing the start means editing env and redeploying. Mercury Books shows 'Start date · The start date of entries · Dec 31, 2024 · Edit', and its dialog explains that an earlier date pulls more history.
- **Change:** Show 'History from Jan 2026' with an Edit link. Edit opens a dialog with a month picker and one line, 'Pulls the earlier months from QuickBooks. This takes a few minutes.' Saving stores the month on the connection and backfills only the added months, newest first.
- **Desktop, tablet, phone:** Desktop and tablet: a dialog. Phone: a sheet with the month picker and a pinned Save. The value row is the same at every size.
- **Reuse:** The dialog primitive listed in docs/components.md; Select for the month; the sync engine's month range in src/lib/quickbooks/sync.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/cc047c78-63c7-4640-a2ce-35f6cee4bba7): Start date shown as a formatted date with a sublabel and Edit, then the toast 'Entries start date updated'.
  - [Mercury](https://mobbin.com/screens/2eac1e1f-c2df-469c-bbca-82eceef63405): The Edit start date dialog: one date field and one sentence on what an earlier date does, with Cancel and Update.
- **Code:** `src/lib/quickbooks/config.ts:29-30`, `src/app/(app)/financials/settings/page.tsx:95`
- **Verification:** partly. Confirmed raw '2026-01' and no in-app control. The 'edit env and redeploy' claim is wrong in a way that makes the finding stronger: historyStart is written only in the callback's create branch (callback/route.ts:55), the update branch omits it, and sync reads conn.historyStart (sync.ts:403). Changing QBO_HISTORY_START therefore never affects an existing connection. Also worth offering the start month on the connect step: QuickBooks' own connect (209da63a) says 'We will pull transactions from 01/01/2025. Or you can select a different date'. Mercury references not spot-checked.

### G2A-I06

**Show P&L accounts by default and put the 22 pinned balance-sheet accounts behind a tab**

Medium · Design change · effort S · `Financials > Settings, Account categories` · The QuickBooks mirror is honest about what it covers

- **Today:** The table lists 90 accounts with a select on each row. 23 carry the lock emoji: 19 are balance-sheet accounts pinned to Excluded, Owner equity or Uncategorized (A/P, A/R, Checking, Savings, Mastercard, Visa, the equity, Truck, liability and current-asset accounts), and 4 are P&L accounts (Insurance, Travel, Uncategorized Expense, Utilities).
- **Why:** Every pinned row is a select Connor can't usefully change, and they make the real job longer. Mercury's Accounts page splits accounts with type tabs (All, Mercury, Bank, Credit, Payments, Payroll), so each view stays short.
- **Change:** Add a segmented control above the table: Income · Expenses · Balance sheet (22), with Expenses as the default. Balance-sheet rows show read-only text ('Excluded') instead of a select.
- **Desktop, tablet, phone:** The three short segments fit at 320. On phone each row becomes two lines: the account name, then its category select at full width. Desktop and tablet keep the table.
- **Reuse:** The segmented control in app/(app)/deals/filters.tsx, extracted to src/components as SegmentedControl per docs/components.md.
- **References:** 
  - [Mercury](https://mobbin.com/screens/6b079900-7246-4944-a078-d3f94e28518b): Account list split by type tabs, each row with one status chip.
- **Code:** `src/app/(app)/financials/settings/page.tsx:46-49`, `src/app/(app)/financials/settings/tables.tsx:126-165`
- **Verification:** partly. Pattern confirmed: 90 accounts sorted alphabetically by acctType, so balance-sheet types interleave with Expense and Income (settings/page.tsx:46-49). Count is off. Mercury 6b079900 not spot-checked. Many rows are Intuit sandbox sample accounts, so the production list will differ, but the split still holds.

### G2A-I08

**Show each class's and account's line count and net amount**

Medium · Design change · effort S · `Financials > Settings, class mapping and account category tables` · The QuickBooks mirror is honest about what it covers

- **Today:** Class rows show only the class name, an 'auto' badge and the Role, Property and Entity selects. Account rows show the name, type and category. Nothing says how much money a class or account carries, so a class with 200 lines and one with none look equally important.
- **Why:** Mapping is triage, and the dollars are the stakes. Attio's import review shows a row count ('1 row') beside each raw value under a 'Needs review' group, so the values that matter get fixed first.
- **Change:** Add a right-aligned muted 'Lines · Net' column, for example '214 · $41,380'. Sort unmapped rows first, then by absolute net. Classes with no lines read 'No lines yet'. This applies to whichever mapping table survives G2A-021.
- **Desktop, tablet, phone:** Desktop and tablet: a column in tabular figures. Phone: a second line under the name, '214 lines · $41,380'.
- **Reuse:** Table and Td with tabular-nums; a ledgerLine groupBy on classKey and accountId.
- **References:** 
  - [Attio](https://mobbin.com/screens/683a5479-19e0-4881-84cd-312a1f9d187a): Each raw value under 'Needs review 3' carries its row count ('1 row') before its mapped value.
  - [Attio](https://mobbin.com/screens/743c9394-4846-4d21-a8ab-c9ac8729ce60): Raw data → mapped value columns, sorted with the items needing review first.
  - [Mercury](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa): The GL Code view lists each code with its amount and share.
  - [Copilot](https://mobbin.com/screens/e4104151-c47b-47fb-9971-327ce2ad89c4): Every category row carries its spend, including the excluded ones.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:42-47`, `src/app/(app)/financials/settings/tables.tsx:128-131`, `src/app/(app)/financials/settings/tables.tsx:43-46`, `src/app/(app)/financials/settings/tables.tsx:129-131`
- **Also found as:** FINANCIALS-I17 (Financials, rent roll and financial settings)
- **Verification:** confirmed. Confirmed: class rows show only the name, an 'auto' badge and three selects (tables.tsx:42-64), and account rows show name, type and category. LedgerLine carries classKey and accountQboId, so the groupBy is cheap. 'G2A-021' is a dangling cross-reference. Attio references not spot-checked.

### G2A-I10

**When a sync brings an unmapped property class, say so above the figures**

Medium · New capability · effort S · `Financials > Overview (and Home)` · The QuickBooks mirror is honest about what it covers

- **Today:** When a class that looks like a property arrives unmapped, the only signal is a '⚠ Unmapped classes that look like a property' row inside the Settings cleanup list. Overview, Rent roll and Home say nothing, even though that property's income is left out of its row.
- **Why:** Each new purchase adds a class, and Connor won't go to Settings to find out. Copilot pins 'Connection needing attention · Found new accounts' with a Sign in button above the balances, so the fix sits where the numbers are.
- **Change:** When the last sync found an unmapped property-like class, show one neutral line above the KPIs: 'New in QuickBooks: HGC 58 Mariner · Map'. Map opens the picker prefilled with the suggested property. Add the same item to Home's what-needs-me list. The line disappears once the class is mapped.
- **Desktop, tablet, phone:** One line at every size. On phone the class name truncates and Map stays visible.
- **Reuse:** The notice row used for the PARTIAL banner on page.tsx, in a neutral tone; qboClass.autoMatchNote supplies the suggestion; dataQuality.unmappedPropertyLikeClasses already exists.
- **References:** 
  - [Copilot](https://mobbin.com/screens/3590b5a3-966b-42b5-888a-6c39f1243a34): 'Connection needing attention · Found new accounts · Sign in' sits in the money view itself, above the balances.
  - [Copilot](https://mobbin.com/screens/c249e8cb-67cb-4d06-a431-7b728d51b95d): A '1 NEEDS ATTENTION' group header puts the only item to act on first.
- **Code:** `src/app/(app)/financials/settings/page.tsx:153-160`, `src/app/(app)/financials/page.tsx:66-89`
- **Verification:** confirmed. Confirmed: the only signal is the conditional '⚠ Unmapped classes that look like a property' row (settings/page.tsx:153-160). No file outside financials and the property card mentions QuickBooks, so Home has nothing. Fits D10 (Home becomes 'what needs me'). Copilot references not spot-checked.

### G2A-I15

**On phone, replace the stacked KPI tiles with one month card and a month stepper**

Medium · Design change · effort M · `Financials > Overview on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 the six KPI tiles stack one per row. The first screen after the header holds four tiles, and the page is 1,831px tall before By property ends. The category and monthly charts follow at full width.
- **Why:** Phones are for a glance. Mercury iOS shows 'November 2025 › Money in ↗ $0.00 · Money spent ↘ −$6.41' in a single row and steps months with a pinned '‹ October 2025 ›' control.
- **Change:** On phone, show one summary card with the month name and ‹ › stepper, then Income, Expenses and NOI in a row of three. By property follows as two-line rows. The category and monthly charts are left out on phone.
- **Desktop, tablet, phone:** Phone only. Tablet keeps the 2 by 2 grid and desktop keeps the row. At 320, the three figures use the compact money format.
- **Reuse:** Kpi with a compact variant; Card; fmtMoney compact option.
- **References:** 
  - [Mercury](https://mobbin.com/screens/646c4676-c9c8-403d-86aa-fe93e411daf0): Home shows 'November 2025 ›' with Money in and Money spent side by side in one row.
  - [Mercury](https://mobbin.com/screens/33aa85ec-2765-421d-b954-5ef74b748e81): The month stepper '‹ October 2025 ›' is pinned at the bottom of the money screen.
  - [Stripe Dashboard](https://mobbin.com/screens/f972bbd5-699d-42c3-942e-1cf9f3d25eda): A 'Today' strip with three figures in one card at the top of the phone home.
- **Code:** `src/app/(app)/financials/page.tsx:76`
- **Verification:** confirmed. Measured: page height 1831px at 375, with six tiles stacked one per row and the subtitle wrapping (overview--mobile-light.png). The month stepper needs the period model from G2A-I20, so the two should land together.

### G2A-002

**There is no Connect button while the sandbox connection exists**

Low · Fix · effort S · `/financials/settings during the sandbox-to-production switch` · The QuickBooks mirror is honest about what it covers

- **Today:** Production is documented to connect with production keys from the start; the sandbox row exists only in the local dev DB. If the environment were flipped under an ACTIVE sandbox row, Refresh or the nightly cron would mark it EXPIRED and expose Reconnect, an indirect but existing path.
- **Why:** The go-live job has no forward path on the screen built for it. The only way through is a destructive control whose two options aren't explained.
- **Change:** When the stored connection's environment differs from QBO_ENVIRONMENT:
- Show the stored company as a muted row: "Sandbox company · replaced when you connect production".
- Show the not-connected block with a primary "Connect production QuickBooks".

After the callback stores the production realm, delete the sandbox realm's rows and say so in the success line: "Connected to HG Capital Partners LLC. Sandbox data removed."
- **Desktop, tablet, phone:** 1280 and 768: the row and button sit in the header block. 375: the button is full width under the line.
- **Reuse:** settings/page.tsx not-connected branch; Button; callback route upsert.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a71edad2-ab06-4d1f-922a-c7c7bfe75279): The test-mode bar names what is missing and holds the go-live action on the right ('To accept payments, complete your business profile' plus 'Complete profile'). HG's sandbox state should read 'Showing sandbox data' with Connect QuickBooks in the same bar.
  - [Stripe](https://mobbin.com/screens/925177de-949b-48e6-97a6-c0cef39a0959): Sandbox is named in a persistent top bar with one clear exit ("Exit sandbox").
  - [Mercury](https://mobbin.com/screens/cb40503d-fd6c-437c-bbba-aaec53ce22f3): Active integration is one row with its state, and connecting another is always available below.
- **Code:** `src/app/(app)/financials/settings/page.tsx:18-38,77-81,84`, `src/app/(app)/financials/settings/controls.tsx:36-66`
- **Verification:** partly. The code is right: Connect renders only when there is no connection or it is REVOKED (page.tsx:18-38). The go-live scenario is doubtful. The only sandbox connection I can find is in the local dev DB (1 row, created 2026-08-31). DEPLOY.md has production use Intuit production keys and QBO_ENVIRONMENT=production from the first connect, and memory says QBO_* are still unset in prod. Even if the switch happened, there is a forward path. Refresh (or the 4 AM cron) tries a token refresh with the production keys, fails, and flips the row to EXPIRED (client.ts:68-75), and the Reconnect link then appears. The path is indirect and the failure text is raw, which G2A-008 already covers. Scoping the connection by environment (G2A-003) is the cheap guard. The Stripe and Mercury references fit only loosely.

### G2A-003

**After the env switch the sandbox stays current, then breaks, and its data is never removed**

Low · Fix · effort M · `QuickBooks connection selection (all money views, nightly cron)` · The QuickBooks mirror is honest about what it covers

- **Today:** True only if a sandbox connection exists when QBO_ENVIRONMENT flips. The local DB has one (4 classes, 90 accounts, 210 lines); production is documented to start on production keys.
- **Why:** For a window of hours, test numbers look like the company's books. Afterwards the old realm is invisible clutter that can resurface if the production row is ever removed.
- **Change:** Scope getConnection to environment = qbo.environment().
- The moment the environment flips, money views show the not-connected state and the cron skips.
- Until then, sandbox views carry DATA-007's Sandbox label.
- On a successful production callback, delete the other environment's connection in one transaction; the realm FKs cascade.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** src/lib/quickbooks/client.ts getConnection; Prisma cascade on realmId.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a71edad2-ab06-4d1f-922a-c7c7bfe75279): A persistent test-data bar across every page until the real account is live.
  - [Stripe Dashboard](https://mobbin.com/screens/e0671e4a-2f26-4311-9c8f-37fe8288209e): When the account goes live, the dashboard says so in one line ('Your account is now active') and the test bar is gone. That is the model for the moment production replaces sandbox.
  - [Stripe](https://mobbin.com/screens/d7461782-27a7-41e9-aa99-ac528bcd4fca): Test data is unmistakably labeled across every page until you leave test mode.
- **Code:** `src/lib/quickbooks/client.ts:35-37,59-75`, `src/lib/quickbooks/oauth.ts:36,53`, `src/app/(app)/financials/settings/actions.ts:129-146`, `Local DB: 1 sandbox connection, 4 classes, 90 accounts, 210 ledger lines`
- **Verification:** partly. Confirmed in code. getConnection takes the newest row regardless of environment (client.ts:35-37). Refresh uses the current keys (oauth.ts:52-54). apiBase follows the current environment (config.ts:38-42). Disconnect acts only on the newest row (actions.ts:131-146). The cascade on realmId exists (schema.prisma:484-634), so deleting the stale connection removes its rows. The scenario has the same limit as G2A-002: nothing shows a sandbox row in production. Severity drops to low. Scoping getConnection to qbo.environment() is still a one-line safety fix worth doing. It largely duplicates G2A-002, since the two share one fix.

### G2A-013

**A run killed at the 60s limit blocks Refresh for 10 minutes**

Low · Fix · effort S · `QuickBooks sync lock (Refresh on Overview and Settings)` · The QuickBooks mirror is honest about what it covers

- **Today:** Only reachable if a single month's fetch and wrap-up overrun the 60s function after the 45s check passes (for example on 429 retries); the run otherwise stops cleanly.
- **Why:** Right after go-live Connor would be told to wait for a sync that is no longer running.
- **Change:** No run can outlive 60s, and heartbeatAt is bumped every month. So treat a RUNNING row as stale after 90s without a heartbeat. Show "The last sync stopped early" with Sync now instead of the skip message.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** src/lib/quickbooks/sync.ts STALE_LOCK_MS.
- **Code:** `src/lib/quickbooks/sync.ts:45,376-381`, `src/app/api/quickbooks/callback/route.ts:12,71-77`, `src/app/(app)/financials/_components/refresh-button.tsx:26-27`
- **Verification:** partly. The code is right. STALE_LOCK_MS is 10 minutes (sync.ts:45,376-381), and a killed after() run would leave the row RUNNING. Reaching it is rare. The run stops itself cleanly at 45s, so a kill needs one month's two report calls plus the wrap-up to push past 60s, for example through 429 retries with up to 30s waits (client.ts:100-105). A shorter heartbeat window is a cheap fix, but this is low severity.

### G2A-017

**"Reconnect before" shows a future deadline on an expired connection, and isn't a deadline anyway**

Low · Fix · effort S · `/financials/settings Connection (Reconnect before row)` · The QuickBooks mirror is honest about what it covers

- **Today:** The row shows a rolling date that moves forward with each token refresh; on an EXPIRED row it would still show the last stored future date.
- **Why:** It is a contradiction in one state and a false deadline in the other.
- **Change:** Remove the row.
- Show "Reconnect by Jan 31" only inside FINANCIALS-047's warning window, or when nightly sync has failed twice.
- When EXPIRED, show "Disconnected Oct 14" (G2A-008).
- **Desktop, tablet, phone:** One less row at every width.
- **Reuse:** settings/page.tsx Row.
- **References:** 
  - [Linear](https://mobbin.com/screens/e64c901c-4ada-4f0a-b3a0-89a6ccf490da): The connected workspace row reads 'Enabled by Alex Smith Apr 7, 2026' with a '● Connected' state. It records when the connection was made and shows no expiry deadline, which is the replacement for 'Reconnect before'.
  - [QuickBooks](https://mobbin.com/flows/33335881-eb02-42b4-8250-205e9c460c9c): The connect flow ends with "We'll remind you 15 days before your connection expires" instead of a permanent date row.
- **Code:** `src/app/(app)/financials/settings/page.tsx:92-94`, `src/lib/quickbooks/client.ts:80-87`
- **Verification:** partly. Code confirmed. The row always prints refreshTokenExpiresAt (page.tsx:92-94), and withFreshToken moves the date on every refresh (client.ts:80-87). Live it reads "Reconnect before Dec 12, 2026" on the ACTIVE sandbox row. The EXPIRED contradiction is from a DOM mock but follows from the code. Removing the row is a good simplification. It is a copy or polish issue in a rare state, so low rather than medium. The QuickBooks flow 33335881 reference was not spot-checked.

### G2A-018

**Connecting from another host, or a slow Intuit sign-in, ends in a silent state_mismatch**

Low · Fix · effort S · `/api/quickbooks/connect (start of the Intuit round trip)` · The QuickBooks mirror is honest about what it covers

- **Today:** Starting Connect on a non-canonical host ends at /login (no session on the callback host) or state_mismatch (session on both hosts); the 10-minute cookie is rarely the limit.
- **Why:** These are go-live day failure paths, and today they produce no message at all (G2A-005).
- **Change:** In the connect route, compare the request origin to new URL(redirectUri).origin. If they differ, 307 to the canonical origin's /api/quickbooks/connect before setting the cookie. Raise the cookie maxAge to 30 minutes, and keep G2A-005's "That sign-in expired. Connect again." for what remains.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** src/app/api/quickbooks/connect/route.ts; qbo.redirectUri().
- **Code:** `src/app/api/quickbooks/connect/route.ts:22-31`, `src/app/api/quickbooks/callback/route.ts:35`, `curl -D - /api/quickbooks/connect: location ...redirect_uri=http%3A%2F%2Flocalhost%3A3000..., Set-Cookie qbo_oauth_state Max-Age=600`
- **Verification:** partly. The code facts are right. The cookie is set on the clicked host with maxAge 600 (connect/route.ts:24-30), and the callback checks it (callback/route.ts:35). On another host the callback first checks the session, which is also host-scoped (callback/route.ts:25-26). Someone who clicked Connect on the vercel.app alias and was never signed in on www lands on /login, not state_mismatch, and the code is lost. The localhost:3000 vs 3200 mismatch I also saw is an artifact of the review server's env, not a product path. Canonicalizing the origin before setting the cookie is a cheap guard. The case is unusual, so low.

### G2A-019

**Let Connor confirm an auto-match without changing it**

Low · Fix · effort S · `/financials/settings class mapping (auto-matched rows)` · The QuickBooks mirror is honest about what it covers

- **Today:** Auto-matched rows carry a gray "auto" badge (tables.tsx:59-63). It clears only when a select changes value (actions.ts:45,61,75).

Every sync re-runs autoMatchClass on autoMatched rows (sync.ts:117-131). A match Connor has eyeballed as correct therefore stays provisional forever and can shift if a property address is edited.
- **Why:** With 25 correct suggestions, Connor needs one act that says "these are right". Changing a value and changing it back isn't one.
- **Change:** Add Confirm on each suggested row, plus "Confirm all 25 matches" in the Properties step of G2A-009. Both set autoMatched=false and keep the values. Label unconfirmed rows "Suggested" rather than "auto".
- **Desktop, tablet, phone:** 1280 and 768: Confirm as a small ghost button at the row end. 375: one "Confirm all" button at the top of the sheet, with per-row confirm on tap.
- **Reuse:** settings/actions.ts (new confirmClassMatch); Badge gray.
- **References:** 
  - [Mercury](https://mobbin.com/screens/b5b9a184-bd88-48e7-ba5a-f3f151278cc2): 'Each transaction shows if it was set automatically, by a rule, or by you', with a Categorization method filter. An auto-matched class should read 'Auto' until a partner confirms it, then 'Set by Connor'.
  - [Copilot](https://mobbin.com/screens/39e851c1-7c5d-4f1e-bf81-1c3be05e5566): A To review card ends in one 'Mark as reviewed' button that accepts what is there without editing it.
  - [Zoho CRM](https://mobbin.com/screens/dd0b3185-dd51-4f4e-bcdd-fe4df8842a6e): All / Mapped (8) / Unmapped (0) segments with "Apply Auto Mapping" as one action.
  - [Rox](https://mobbin.com/screens/7bd84fc8-4585-4367-b1df-27c5935787ce): "Review your mappings" lists each suggested pair with a check and a single continue.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:59-63`, `src/app/(app)/financials/settings/actions.ts:45,61,75`, `src/lib/quickbooks/sync.ts:117-131`
- **Verification:** partly. Code confirmed. The gray "auto" badge clears only on a select change (actions.ts:45,61,75), and sync re-runs autoMatchClass on autoMatched rows (sync.ts:117-131). This adds a control and an action, so it is a capability, not a "fix". It belongs inside G2A-021's Properties step ("Confirm all") rather than a per-row button on every table row. Low: a correct auto-match that stays provisional costs nothing unless an address is edited.

### G2A-026

**Map a property to its QuickBooks class right on the property card**

Low · New capability · effort M · `/properties/[id] Financials card (unmapped property)` · The QuickBooks mirror is honest about what it covers

- **Today:** An unmapped property (767 Prospect) shows "No QuickBooks class is mapped to this property yet. Map it in Financials → Settings." The link lands at the top of a long settings page.
- **Why:** Mapping one property is a single choice. Sending Connor to a 30-row table loses the context he's in.
- **Change:** Replace the line with "Which QuickBooks class is 767 Prospect?" and a menu of unmatched classes, likely ones first.
- Picking one calls mapClassToProperty and the card fills in place.
- "Not in QuickBooks yet" hides the prompt for this property.

This builds on PROPERTY-014 (move the notice) and JOURNEYS-042 (link target).
- **Desktop, tablet, phone:** 1280 and 768: inline menu button in the card. 375: the button opens a bottom sheet list.
- **Reuse:** settings/actions.ts mapClassToProperty; menu via React Aria; financials.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/28f577f9-1da9-46ec-8ca8-aa5648ba113d): The accounting code is a select inside the record's own drawer ('Xero GL Code', with 'Review and sync on your Accounting Page' as a link). Map the class inside the property's Financials card the same way.
  - [Deel](https://mobbin.com/screens/7b7a9f07-cad9-4c17-807a-d9e2df6f45ac): "Match accounts" fix action sits right where the unmatched problem is stated.
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:18-33`
- **Verification:** partly. Observation verified on 767 Prospect (verify-G2A/prop-767--fin--desktop-light.png). Adding a mapping menu to the property card creates a third mapping surface, alongside Settings and G2A-021's Properties step, for a one-time job where most properties auto-match. That cuts against the simplicity bar. Deep-linking the existing notice to the property's row in the Properties step (JOURNEYS-042) covers the need. Low.

### G2A-027

**State the period once instead of "(9 mo)" on every property row**

Low · Design change · effort S · `/financials By property (populated, 11 rows)` · The QuickBooks mirror is honest about what it covers

- **Today:** Live, the same "(5 mo)" repeats on five KPI tiles; the per-property repetition is shown only in mocked screenshots but follows from the code.
- **Why:** Eleven copies of one fact is noise. The useful signal, a property owned for fewer months than the rest, is buried.
- **Change:** Put the period once in the card header: "Jan 1 to Oct 22, 2026". Show a row note only when a property's months differ from the period, e.g. "since Jul" for a mid-year purchase. Apply the same rule in the rent grid. This builds on DATA-020 and COPY-023.
- **Desktop, tablet, phone:** 1280: the period sits right-aligned in the card header. 768: same, and rows stay one line. 375: the period moves under the title; FINANCIALS-040's list rows carry the "since" note as a subline.
- **Reuse:** PartialLabel and Kpi in financials/_components/ui.tsx; CardHeader.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/f972bbd5-699d-42c3-942e-1cf9f3d25eda): Period pills (1W, 4W, 1Y, MTD, QTD, YTD, ALL) set the span once, and each figure shows its date range under it ('Jun 13 – Today'), with no per-row month counts.
  - [Origin](https://mobbin.com/screens/f36cc102-ee4d-4eca-93f0-30e903dd468b): Period stated once above the chart ("Custom · Oct 1, 2025 - Mar 2, 2026"); table rows carry only figures.
  - [Mercury](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62): "Last month" chosen once at the top governs every panel.
- **Code:** `src/app/(app)/financials/page.tsx:192`, `src/app/(app)/financials/_components/ui.tsx:10-13`
- **Verification:** partly. PartialLabel logic is confirmed (ui.tsx:10-13, financials/page.tsx:192). The 11-row By property table and the 768 wrapping are from an injected mock; the local data has no property rows. The repetition is visible live, though: 5 of the 6 KPI tiles show "(5 mo)" (verify-G2A/overview--desktop-light.png). Stating the period once is right. It is polish, so low.

### G2A-028

**Flag months that came in short instead of leaving them identical to full months**

Low · New capability · effort S · `/financials/rent-roll (populated, 11 properties by 10 months)` · The QuickBooks mirror is honest about what it covers

- **Today:** No short-month flag exists, but the cited short months are mock data; the local rent roll is empty.
- **Why:** "Did everyone pay?" is the rent page's job. Today Connor has to scan 110 numbers by eye.
- **Change:** Until scheduled rent exists (FINANCIALS-007), flag a month cell when it is more than 10% under the property's median full month.
- Mark: a small amber dot before the figure.
- Hover (desktop) or tap (touch) shows: "$1,150 under the usual $3,600".
- The row header gets a muted "2 short".
- Exclude the running month.
- **Desktop, tablet, phone:** 1280: dots in the grid. 768: same, inside FINANCIALS-030's pinned-column grid. 375: the month stepper view lists properties for one month, and short ones carry the dot and the gap amount inline.
- **Reuse:** rent-roll/page.tsx; Tooltip (components/tooltip.tsx) plus a tap sheet on touch; amber is reserved for warnings per FINANCIALS-015.
- **References:** 
  - [Mercury](https://mobbin.com/screens/f41ddda3-30cd-4bed-8730-9ab936b86a4c): Month-column grid with right-aligned figures and the running month labeled "Sep MTD".
  - [Mercury](https://mobbin.com/screens/67a22ab9-8672-4acb-a980-cfda6b7e810d): Insights call out unusual months in one plain sentence beside the figures.
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:72-76`
- **Verification:** partly. Every example (118 Congress Apr $2,450 vs $3,600, 15 Oxford, 58 Mariner) comes from fabricated rent values injected by states.mjs. The live rent roll has no rows (verify-G2A/rentroll--desktop-light.png). A median-based amber flag without lease data would also mark vacancies, mid-month move-ins and rent changes as "short", which is noise on a 110-cell grid. Fold this into FINANCIALS-007 (scheduled rent) so the flag compares against what was due. The Mercury f41ddda3 and 67a22ab9 references are real (spot-checked).

### G2A-029

**Return to the page where Connect or Reconnect was clicked**

Low · Fix · effort S · `/api/quickbooks/callback redirect target` · The QuickBooks mirror is honest about what it covers

- **Today:** The callback always redirects to /financials/settings (callback/route.ts:17). Once Reconnect lives on Overview, property cards and Home (G2A-008), Connor would land on Settings instead of back where he started.
- **Why:** A reconnect from a property page should end on that property with its figures refreshed.
- **Change:** Connect accepts ?return= with a same-origin path only. Carry it in the signed state or the state cookie, and have the callback redirect there with G2A-005's status param. Default to the QuickBooks settings page.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** connect/route.ts and callback/route.ts; oauth.ts signState.
- **References:** 
  - [QuickBooks](https://mobbin.com/flows/33335881-eb02-42b4-8250-205e9c460c9c): The connect flow ends with Done back on the page it started from.
- **Code:** `src/app/api/quickbooks/callback/route.ts:17`, `src/app/api/quickbooks/connect/route.ts:22-23`
- **Verification:** confirmed. callback/route.ts:17 always returns to /financials/settings. This is only worth doing alongside G2A-008. The QuickBooks flow reference is weak support for "return where you started".

### G2A-030

**Unmapped classes are marked in error red**

Low · Design change · effort S · `/financials/settings class mapping (needs mapping badge)` · One design system, fixed in the primitives

- **Today:** Every UNMAPPED class gets Badge tone="red" "needs mapping" (tables.tsx:55). On the first production sync that is about 5 red chips at the top of the table, in light and dark.
- **Why:** Red marks overdue and errors elsewhere. A class waiting for a decision is to-do, not failure, and five red chips make the first run look broken.
- **Change:** Drop the per-row chip. Count the work in the step header ("5 to map") and leave the rows neutral with an empty picker. Use amber only if a property-like class stays unmapped after setup.
- **Desktop, tablet, phone:** Same at every width; on phone the count sits on the step row.
- **Reuse:** Badge tones per docs/components.md.
- **References:** 
  - [Attio](https://mobbin.com/screens/683a5479-19e0-4881-84cd-312a1f9d187a): Items needing review get a small orange dot and a 'Needs review' group header. Red is kept for values that are actually invalid.
  - [Zoho CRM](https://mobbin.com/screens/dd0b3185-dd51-4f4e-bcdd-fe4df8842a6e): Unmapped state expressed as a neutral segment count, "Unmapped (0)", not red rows.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:54-58`
- **Verification:** confirmed. tables.tsx:54-58 uses Badge tone red for UNMAPPED. Red for a pending decision conflicts with the house rule that statuses keep fixed colors. Moving the count into the step header fits G2A-009/021. Zoho dd0b3185 was not spot-checked.

### G2A-031

**Connection rows wrap unevenly on narrow phones**

Low · Fix · effort S · `/financials/settings Connection rows at 320` · The QuickBooks mirror is honest about what it covers

- **Today:** Row uses a fixed w-40 label with flex-wrap (page.tsx:216-222), which leaves about 96px for the value at 320. Some values wrap under their label (Status, Company, Basis, Last sync) and one stays beside it (Environment), producing a ragged column.
- **Why:** Things that should line up don't (house rule).
- **Change:** Below sm, stack every label above its value. Alternatively use a w-28 label column with values truncating on one line.
- **Desktop, tablet, phone:** 1280 and 768 unchanged. 375 and 320 stacked.
- **Reuse:** settings/page.tsx Row.
- **Code:** `src/app/(app)/financials/settings/page.tsx:216-222`
- **Verification:** confirmed. Reproduced on the live page at 320 (verify-G2A/settings--narrow-light.png). Company, Basis and Last successful sync drop under their labels; Status, Environment, Reconnect before and History from stay beside them.

### G2A-032

**Connect can end on raw JSON or on Home with no explanation**

Low · Fix · effort S · `/api/quickbooks/connect and /callback edge exits` · The QuickBooks mirror is honest about what it covers

- **Today:** Two edge exits leave Connor stranded:
- When QBO_* is incomplete, Connect answers a top-level browser navigation with a JSON 503 that names env vars (connect/route.ts:15-20). The Reconnect link (page.tsx:77-81) is rendered without checking configuration.
- Signed out, both routes redirect to /login with no return path (connect/route.ts:13, callback/route.ts:26). That throws away Intuit's one-time code, and after sign-in Connor lands on Home.
- **Why:** These are dead ends with developer text or silence.
- **Change:** Not configured: redirect to /financials/settings?error=not_configured with the line "QuickBooks isn't available right now." Signed out: redirect to /login?next=/financials/settings with the line "Sign in, then connect again." Render Reconnect only when qbo.isConfigured().
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** connect/route.ts, callback/route.ts; G2A-005's status line.
- **References:** 
  - [Turo](https://mobbin.com/screens/7ec824a0-735e-4296-b743-6d8ef97bbdbd): A failed link attempt returns to the same page with one plain line instead of a raw error.
- **Code:** `src/app/api/quickbooks/connect/route.ts:13-20`, `src/app/api/quickbooks/callback/route.ts:26`, `curl -D - /api/quickbooks/connect signed out: 307 location /login`
- **Verification:** confirmed. Verified. connect/route.ts:15-20 returns JSON 503. The signed-out redirects drop the return path (connect/route.ts:13, callback/route.ts:26). The /login page has no next support at all (login/page.tsx:13-15, actions.ts:42 always redirects to "/"), so the fix needs that added too. The Turo reference is weak.

### G2A-I01

**Say which partner connected QuickBooks and when**

Low · Design change · effort S · `Financials > Settings, Connection card (future Settings > QuickBooks)` · The QuickBooks mirror is honest about what it covers

- **Today:** The Connection card stores connectedByUserId but shows neither who connected nor when. Any QuickBooks admin can reconnect, so the gap is provenance, not a reconnect blocker.
- **Why:** With two partners, the person who connected is the one whose Intuit login must reconnect, and Pieter has no way to know that's Connor. Linear's integration page prints 'Enabled by Alex Smith Apr 7, 2026' under the connected workspace, and that provenance is what makes an admin page trustworthy.
- **Change:** Add one muted line under the company name: 'Connected by Connor on Oct 22, 2026'. When the other partner reconnects, it updates to their first name and date. Pull the first name from the existing connectedBy relation.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the sublabel sits under the company name in the card header. Phone 375: the same short line under the name, which fits on one line at 320.
- **Reuse:** Row/Field layout in settings/page.tsx; the connectedBy relation already in prisma/schema.prisma.
- **References:** 
  - [Linear](https://mobbin.com/screens/e64c901c-4ada-4f0a-b3a0-89a6ccf490da): 'AS Mobbin · Enabled by Alex Smith Apr 7, 2026 · ● Connected': provenance sits directly under the connected account.
- **Code:** `src/app/(app)/financials/settings/page.tsx:75-95`, `src/app/api/quickbooks/callback/route.ts:56`, `prisma/schema.prisma:461-462`
- **Verification:** partly. Confirmed the card shows no provenance (settings/page.tsx:75-95; connectedByUserId written at callback/route.ts:56,67). Linear e64c901c spot-checked and verified: 'Enabled by Alex Smith Apr 7, 2026' under the connected account. The 'why' is overstated: any Intuit user with admin rights on the company can reconnect, so this line is nice provenance, not something that blocks Pieter. The larger defect in the same rows is that Company shows the realm ID because companyName is never written (G2A-V03).

### G2A-I07

**Set one category on many accounts from a floating selection bar**

Low · New capability · effort M · `Financials > Settings, Account categories` · The QuickBooks mirror is honest about what it covers

- **Today:** Each account has its own native select and every change refreshes the route. The example group is sandbox-only, and most production accounts arrive categorized.
- **Why:** First-time mapping is mostly the same answer applied to groups of rows. Mercury adds a checkbox column, and selecting rows raises a floating '2 selected · GL Code' bar so one pick applies to all of them.
- **Change:** Add a checkbox column; checking a parent account also checks its children. Selecting raises a floating bar: '7 selected · Set category ▾ · ✕'. One action updates them all, followed by one toast: '7 accounts set to Repairs & maintenance · Undo'.
- **Desktop, tablet, phone:** Desktop and tablet: a floating bar at the bottom center. Phone: no checkboxes, because bulk configuration stays on desktop per the mobile scope, and single selects still work.
- **Reuse:** New, based on Mercury's bar and Linear's N selected bar. Reuse Select and the Toast from G2A-I05.
- **References:** 
  - [Mercury](https://mobbin.com/screens/3380c227-a662-426a-8bcb-70e1d20ba4e1): Checked rows raise a floating '2 selected' bar with a GL Code select that applies to all of them.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:146-160`
- **Verification:** partly. Mercury 3380c227 verified ('2 selected' bar with a GL Code select). The seven 'Job Expenses:*' rows exist, but they are Intuit sandbox sample accounts for a landscaping company and won't be in the production chart. categorize.ts auto-assigns categories, so manual recategorizing at go-live is the exception. A checkbox column plus a floating bar is new chrome for a rare job. Lighter option: when a parent account's category changes, apply it to its children in the same action.

### G2A-I13

**Show negative money in neutral ink with a true minus, not red**

Low · Design change · effort S · `Financials > Overview KPIs` · Money, numbers and dates read one way

- **Today:** Kpi colors any negative figure red, so NOI and Cash flow after debt both read '-$1,904' in red. The same -$1,904 is black in the By property table, and the monthly NOI column (-$317, -$1,185) is black too. Every one uses a hyphen rather than a minus sign.
- **Why:** The same figure in two colors on one page means color isn't doing a job. Mercury shows net cash flow '−$225' in neutral ink with a true minus and keeps color for money in or failures, which is what the house rule 'every color has a job' asks for.
- **Change:** Render all negative money in the default ink, with a true minus (U+2212) applied once in fmtMoney. Red stays reserved for failed or blocked states.
- **Desktop, tablet, phone:** Identical at all sizes.
- **Reuse:** fmtMoney in src/lib/utils.ts; Kpi in financials/_components/ui.tsx.
- **Challenges:** docs/components.md documents Kpi as 'red when negative'; Mercury's convention and the house rule that every color has a job argue for dropping it.
- **References:** 
  - [Mercury](https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605): Net cash flow '−$225' and '−122.5% vs prior period' in neutral ink.
  - [Mercury](https://mobbin.com/screens/28f577f9-1da9-46ec-8ca8-aa5648ba113d): Money out '−$2.55' in ink with a true minus. Only money in is green.
- **Code:** `src/app/(app)/financials/_components/ui.tsx:35`, `src/app/(app)/financials/page.tsx:210`
- **Verification:** confirmed. Seen: KPI NOI and Cash flow '-$1,904' in red, while By property and the monthly column show '-$1,904', '-$317' and '-$1,185' in ink. fmtMoney uses Intl currency, which outputs a hyphen-minus (utils.ts:8-17). conflicts_with correctly names the docs/components.md Kpi note.

### G2A-I21

**Compare each KPI to the same span a year earlier**

Low · New capability · effort M · `Financials > Overview KPIs` · The QuickBooks mirror is honest about what it covers

- **Today:** Each KPI tile shows one figure with '(5 mo)'. There's no comparison to any earlier period, so -$1,904 NOI has no context.
- **Why:** A figure with no comparison doesn't say whether it's good. Copilot writes '↘ 46.59% vs $550.79 in Jul 1 – Jul 20, 2026', and Stripe's phone app shows the prior figure in gray with its dates.
- **Change:** Add one muted line under each figure, such as 'vs $4,210 Jan to Sep 2025', for the same span one year earlier. Hide the line when synced history doesn't cover that span, which will be common right after go-live until G2A-I04 pulls more months.
- **Desktop, tablet, phone:** Desktop and tablet: one line under each figure. Phone: only the percentage change, under each of the three figures in the month card.
- **Reuse:** The Kpi hint prop; the same query run over the prior range.
- **References:** 
  - [Copilot](https://mobbin.com/screens/39e851c1-7c5d-4f1e-bf81-1c3be05e5566): 'Net this month $294.14 ↘ 46.59% vs $550.79 in Jul 1 – Jul 20, 2026': a like-for-like comparison with its dates.
  - [Stripe Dashboard](https://mobbin.com/screens/f972bbd5-699d-42c3-942e-1cf9f3d25eda): The current figure with its range, the prior figure in gray with its range, and the change in the corner.
- **Code:** `src/app/(app)/financials/page.tsx:76-89`
- **Verification:** confirmed. Valid but low. History starts 2026-01, so the comparison stays hidden for the first year unless G2A-I04 lands. Copilot and Stripe references not spot-checked.
