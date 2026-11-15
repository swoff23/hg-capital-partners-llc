# Update notice: "A new version is ready"

The spec for telling a tab that's been left open that a new version of the app is live, and letting the person load it. Planned with Connor on Nov 14, 2026, against `b0bc4d2`, and built the same day after his "build it".

## 1. Summary

**What's wrong today**

- **Open tabs never hear about a deploy.** Skew Protection went on today (Nov 14, 12-hour max age). It keeps a tab that was open before a deploy talking to its own deployment, so nothing breaks. But it also means that tab keeps running the old code for up to 12 hours, and nothing tells the person a newer version exists.
- **After 12 hours the old tab breaks.** Its next save calls a server action the live deployment doesn't have. On the task page that throws to the error screen (docs/uiux-review/g2b.md, G2B-I13).

**What changes**

- The app checks which version is live: when you come back to the tab, when you're back online, and every 5 minutes while the tab is showing.
- When the live version differs from the one the page loaded with, a toast appears and stays: a refresh icon, "A new version is ready" and Reload. Pressing anywhere on it reloads the page.
- Until then, the next in-app link you click loads its page fresh instead of swapping it in. That way anyone who ignores the toast still gets current within a click or two.
- Unsaved work is never lost. Reload asks first through the leave sheet you already know, and a link only does a full load when nothing on the page is holding.
- Staff pages and the contractor portal get it. The public site doesn't.

## 2. Decisions (Connor, Nov 14)

| # | Question | Decision |
|---|---|---|
| 1 | Where it shows | **A, sticky toast.** The existing ink toast in its usual spot, staying until it's used or dismissed. Not a top banner (B) or a sidebar card (C) |
| 2 | Taking the update without the click | **B, also on the next link.** Once an update is known, the next in-app link does a full page load. No background reload of a hidden tab (C) |
| 3 | Reload with unsaved work | **A, ask first.** Reload goes through the `LeaveGuard`; the sheet's leave button reads "Reload anyway". The toast is not held back while you work (B) |
| 4 | Who sees it | **A, staff and contractors.** The staff app and the contractor portal. Not the public site or the move-in form |
| 5 | Wording | **B, "A new version is ready"** with **Reload** |
| 6 | Icon | **A, refresh arrows** (lucide `RefreshCw`) before the message. Not the HG monogram (B) or an up arrow (C) |
| 7 | The × | **A, hidden until the next deploy.** The next link still updates you. It doesn't come back on return (B), and the × isn't removed (C) |

## 3. Behavior

### 3.1 Knowing which version is live

- **The version is the commit.** `VERCEL_GIT_COMMIT_SHA` from `getEnv()` (already in `src/lib/env.ts`, already public through `/api/health`'s `commit`). A redeploy that only changes an env var keeps the same code, so it doesn't prompt anyone. A promote or Instant Rollback to another commit does, which is right: the page's code differs from what's live.
- **The page's own version** comes from its layout. `(app)/layout.tsx` and `(portal)/p/layout.tsx` pass `getEnv().VERCEL_GIT_COMMIT_SHA ?? null` to `UpdateNotice`. Layouts render once per page load and persist across client navigations, so the prop is the version the tab is running.
- **The live version** comes from a new `GET /api/version`: `{ version: string | null }`, `force-dynamic`, `Cache-Control: no-store`, no database call and no session needed (the proxy's matcher doesn't cover `/api`). The client fetches it with `cache: "no-store"`.
- **Why the fetch reaches the live deployment.** Skew Protection pins requests that carry `x-deployment-id`, a `dpl` query or a `__vdpl` cookie. Next adds the header only to its own navigation and action requests, and it sets the cookie only under `experimental.useSkewCookie`, which we don't use (`node_modules/next/dist/lib/load-custom-routes.js`). A plain `fetch` carries none of them, so it reaches production. The preview check in section 7 confirms this before landing.
- **Local dev and immutable preview URLs** never show it. Locally the SHA is unset, so both sides are null and the notice does nothing. A per-deployment preview URL always answers with its own SHA. A branch alias moves with each push, so it does show the toast, which is how section 7 tests it.

### 3.2 When it checks

- On the same return moments `RefreshOnReturn` uses (`lib/refresh-on-return.ts`): the tab shown again (after any time away, not only a minute), back online after `ONLINE_SETTLE_MS`, and a page restored from Safari's back-forward cache. At most once every 30 seconds (`CHECK_GAP_MS`).
- Every 5 minutes while the tab is showing. Never while it's hidden.
- Not on first load, since the page was just served.
- A failed fetch is silent and the next trigger tries again.
- Checking goes on after an update is known. A second deploy replaces the toast, brings back one that was closed for the first (decision 7), and a live version that's back to the tab's own (a rollback) takes the toast down.

### 3.3 The toast (decisions 1, 5, 6, 7)

- **Content:** `RefreshCw` in `--toast-fg-2`, then "A new version is ready", then "Reload" underlined in `--toast-fg`, then the ×.
- **One button.** The icon, the message and Reload are a single button, so pressing anywhere on the pill reloads, as Connor asked. The × is its own button beside it.
- **Sticky.** No timer, and other toasts never push it out of the three shown. It stacks with them in the usual order.
- **The × and Esc** hide it until the next deploy: the live version is remembered in `localStorage` (`hg:update-dismissed`, every read and write in try/catch). The next-link rule (3.4) keeps working after a dismiss.
- **On touch the × is drawn,** at 44px. Toasts with an action normally hide it on touch because they close themselves after 8 seconds. This one doesn't, so it needs a visible way to close.
- **Motion:** the usual `animate-toast-in`. Once Reload is really reloading (nothing held, or "Reload anyway"), the arrows spin until the page goes. A press that opens the leave sheet doesn't spin them. Neither moves under reduced motion.
- **Screen readers:** the toast region is already a polite live region, so "A new version is ready" is announced once. The button's name is its text, "A new version is ready Reload".

| Size | Behavior |
|---|---|
| Laptop 1280x800 | Bottom-left pill, content width up to `max-w-sm`. 16px icon at 1.5 stroke. Hover fill on the button and the × |
| Tablet 768x1024 | Same spot and width. Touch layout: 20px icon at 1.75 stroke, 44px button and ×, no hover cues |
| Phone 375x667 and 320 | Full width at the bottom, lifted above a docked bar by `useToastInset` as today. 20px icon, 44px targets. "A new version is ready" is 22 characters, under the 30 that fit at 320 (`TOAST_PHONE_CHARS`), so nothing is cut and nothing drops |

### 3.4 The next link (decision 2)

- Once an update is known, a capture-phase `click` listener on `window` turns the next in-app link into a full page load: `preventDefault()`, `stopPropagation()`, `location.assign(href)`. It runs before React's handlers, so Next's `Link` never starts a client navigation.
- **It only takes plain clicks:** the main button with no modifier keys, on an `<a href>` with the same origin, no `download`, no `target` other than `_self`, and a different path or query from the current page (a hash-only link is left alone).
- **It steps aside when the page is holding,** whether that's unsaved work (`useUnsavedWork()`) or an upload the outbox can't keep (`engine.needsLeaveWarning()`). In that case the click goes through as it does today, so the leave sheet asks, and the next free link takes the update instead.
- **Create sheets open as usual.** A link to `/tasks/new`, `/deals/new`, `/properties/new` or `/contractors/new` opens its sheet over the page through the `@modal` slot. A full load would show the full-page form instead, so those links are left alone and a later link takes the update.
- Navigations that aren't links, like `router.push` from the command palette or a button, aren't caught. The toast is still there for those.

### 3.5 Reload with unsaved work (decision 3)

- Reload calls `guard(() => location.reload())` from `useLeaveGuard({ leaveLabel: "Reload anyway" })`. With nothing held, it reloads at once.
- With a hold, the leave sheet opens as it does for a link: the hold's own title ("Leave Unit 2?"), its stay button as the main one ("Keep editing"), and "Reload anyway". It's a dialog on laptop and tablet and a bottom sheet on phone, which is the `Sheet` as it is today.
- Uploads the outbox keeps resume after the reload, so they don't ask, exactly as the "Uploads paused · Reload" notice already works. An upload the outbox can't keep is left to the browser's own "Leave site?" prompt (`useLeaveWarning`), as it is for any reload today, rather than asking twice.

### 3.6 Who sees it (decision 4)

- **Staff:** `UpdateNotice` mounts in `(app)/layout.tsx` beside `RefreshOnReturn`, inside `UploadQueueProvider` (so it can read the engine) and under `AppShell`'s `ToastProvider`.
- **Contractors:** it mounts in `(portal)/p/layout.tsx` inside `PortalUploadQueue`, under the portal's own `ToastProvider` and `LeaveGuard`.
- **Not the public site** (`(marketing)`, `/welcome`, the move-in form). Visitors there are one-time, the move-in form saves its draft in the browser, and the 12-hour skew window covers a slow finisher.

## 4. Copy

| Where | Words |
|---|---|
| Toast | A new version is ready |
| Toast action | Reload |
| Leave sheet's leave button, from Reload | Reload anyway |
| × | aria-label "Dismiss" (as today) |

Checked against docs/copy-rules.md: one line at 320, no em dash, no filler, and the button names the next step. Connor chose B over "HG Capital was updated" (A).

## 5. Reuse check

**Reused as is**

- `ToastProvider` and `useToast`: position, phone width, `useToastInset`, the live region, Esc, `animate-toast-in`, the `--toast-*` tokens.
- `LeaveGuard`, `useUnsavedWork` and the `Sheet` that asks: the unsaved-work rule and its words.
- The upload engine's `needsLeaveWarning()` (via `useUploadEngine()`), the same check behind "Uploads paused · Reload".
- `RefreshOnReturn`'s triggers and constants in `lib/refresh-on-return.ts` (`ONLINE_SETTLE_MS`), so both decide "came back" the same way.
- `RELOAD_LABEL` ("Reload") from `lib/lazy-module.ts`, so the app has one word for this action.
- `getEnv().VERCEL_GIT_COMMIT_SHA`, already read by `/api/health`.

**Extended**

- `ToastInput` gets `icon` (a lucide icon drawn before the message), `sticky` (no timer, never evicted, × drawn on touch, and with an action the icon, message and action are one button that stays after it's pressed) and `onDismiss` (runs on × or Esc). A sticky toast's `onAction` returns true when the page is going away, which spins the icon.
- `addToast` in `toast-queue.ts` keeps sticky toasts when it trims to `max`, with a test.
- `useLeaveGuard` gets `leaveLabel`, which the sheet uses instead of "Leave anyway".

**New**

- `src/components/update-notice.tsx` `UpdateNotice({ version })`: the checks, the toast, the dismissal and the link listener. It gets a docs/components.md row ("Tell a tab left open that a new version is live").
- `src/lib/app-version.ts`: the pure rules and words, with tests. `updateState(loaded, live, dismissed)` decides current, toast or link-only. `fullLoadHref(click, link, here)` returns the href to load, or null for a click to leave alone.
- `src/app/api/version/route.ts`, public on purpose and on `auth-guard.test.ts`'s allowlist: it shows only the commit, which `/api/health` already shows anyone.

Invented here, with nothing in the references to copy: turning the next link into a full load only while nothing holds the page. It's built from the guard's existing rules.

## 6. References

- **A dark toast with an action, bottom of the screen:** [TIDAL](https://mobbin.com/screens/548b60c5-b45d-4ca9-81db-17875594fcd5), [Shopify](https://mobbin.com/screens/3fb1d3f1-b03a-437f-9143-c89b512814c6). Vercel's dashboard and Figma show their "new version" notice as a toast (from memory; Mobbin has no screen of it).
- **A sidebar card, considered and not used:** [Linear's "What's new"](https://mobbin.com/screens/71a0482d-226d-44bf-aac0-1abc44a7c40b).
- **A top banner, considered and not used:** Slack's "Slack has been updated" bar (from memory).
- **Taking the update on the next navigation:** GitHub and Linear (from memory). Next does the same on its own once the skew window ends: a deployment mismatch on navigation is a full reload (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/deploymentId.md`).
- **Leading icon:** lucide `RefreshCw`, the brand's icon rules (docs/brand-guidelines.md section 6).

## 7. Checks

- **Unit tests:** `app-version.test.ts` covers the state for each case (same version, new version, dismissed for this version, dismissed for an older one, either side null) and which clicks get a full load (modifier keys, other origins, `download`, `_blank`, hash-only, same page). `toast-queue.test.ts` checks that a sticky toast survives three newer ones. `component-wiring.test.ts` checks that both layouts mount `UpdateNotice`.
- **By hand, locally:** run `VERCEL_GIT_COMMIT_SHA=aaa npm run dev`, open a task page, restart with `=bbb`, and switch tabs away and back. Then check at 1280, 768, 375 and 320: the toast, a press anywhere on it, the × and Esc (it stays gone after a return), a link doing a full load (a document request in the network panel), a link with a dirty note (the sheet asks, and the next link takes the update), and Reload with a dirty note ("Reload anyway"). Do the same on a portal job page.
- **Device check:** `npm run test:devices`. The default state shows no toast, so the sweep is unchanged.
- **On a preview before landing:** open the branch alias, push an empty commit, and confirm the toast appears within 5 minutes, which proves the plain fetch isn't pinned by Skew Protection. Then click a link and confirm it's a full load. For this build the same proof runs on production right after the push: a page loaded from the old deployment fetches `/api/version` and should get the new commit. Production already carries a deployment id (`data-dpl-id`), sets no `__vdpl` cookie, and `/api/health` shows the runtime sees `VERCEL_GIT_COMMIT_SHA`.
- **Landing:** typecheck, lint and `npm test` on the merged code, as usual.

## 8. Later, not in this build

- **The 12-hour edge (G2B-I13).** A tab left open past Skew Protection's max age can still hit a missing server action before it checks. Catching `UnrecognizedActionError` in the shared runners could show this same toast instead of the error screen.
- **What changed.** A "What's new" link from the toast would need release notes someone writes. Not planned.
