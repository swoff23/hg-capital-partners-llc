# Staff password reset

Planned with Connor on Nov 16, 2026. He asked for Forgot password to work for staff logins too and took the defaults below. He said "build it" the same day, and it's built.

## 1. Summary

**Why.** Forgot password only emails contractor logins today ([asana-migration-plan.md](../asana-migration-plan.md), default 2). A staff email gets the "Check your email" screen and nothing is sent, which is what Connor hit on Nov 16. `CONNOR_PASSWORD` and `PIETER_PASSWORD` were deleted from Vercel on Nov 14, so a partner who forgets their password can now only get back in through a hand edit to the production database.

**What changes.**

- Forgot password emails Connor or Pieter a reset link the same way it emails a contractor: the same pages, the same 30-minute single-use link and the same limits.
- Choosing a new password signs that partner out on every device. They sign in again with the new one.
- No screen changes.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Staff logins get Forgot password, the flow contractors already have |
| D2 | A reset signs the partner out everywhere, the browser they reset from included |
| D3 | Staff passwords follow the contractor rules: at least 10 characters, at least 4 different characters, not the email |

## 3. Calls made in this spec, for Connor to check before "build it"

1. **Only a partner who already has a password can reset.** Clearing a User's password in the database is how a staff login gets turned off today (`src/lib/auth.ts` treats a missing password as signed out). If Forgot password could set a first password, that switch would stop working. So adding a user keeps its current runbook, and `scripts/backfill-password-hashes.ts` stays. In chat I said the script would go; this is why it doesn't.
2. **The email line drops "jobs"** for staff: "Here's your link to choose a new password for HG Capital." The subject ("Reset your HG Capital password") and the 30-minute footnote stay.
3. **Staff reset emails share the 100-a-day Resend cap.** `src/lib/notifications/sent-count.ts` already counts every reset email that went, whoever it was for.
4. **It stays behind `PORTAL_ENABLED`**, like the forgot and reset pages it uses. Production has it on.
5. **The Gmail inbox now opens the app.** Anyone who gets into Connor's or Pieter's email can reset their way in, and the staff login sees tenants, loans and P&L. Both inboxes should have 2-step verification on. Nothing in the build depends on this.

## 4. How it works

### Asking for a link (`startPasswordReset` in `src/lib/portal/reset.ts`)

Inside the existing locked transaction, after the per-email and per-IP counts: look up a contractor login as today. If there isn't one, look up a User with that email and a password. An email is never both (`src/lib/portal/accounts-core.ts` checks when a contractor login is made or its email changes). The token is written with `userId` instead of `accountId`, and the `PASSWORD_RESET_REQUESTED` event gets `userId`. The response is the same for every address, as now.

### Opening the link (`findUsableToken`, `resetTokenIsUsable`)

The token row loads its contractor login or its User. A staff token works while it's unused, under 30 minutes old, and the User still has a password.

### Saving the new password (`finishPasswordReset`)

A staff branch in the same transaction: consume the token (only one of two racing submissions wins, as now), set `User.passwordHash` and `User.passwordChangedAt`, expire the user's other open tokens, and log `PASSWORD_RESET` with `userId` and `{ by: "email-link" }`. Then clear the login throttle for that email and redirect to `/login?notice=reset`, which already says "Password changed. Sign in with the new one."

### Signing out everywhere (`src/lib/session.ts`, `src/lib/auth.ts`)

A staff session is a signed cookie with no database row, so there's nothing to revoke. The cookie already records when it was issued (`iat` in `src/lib/session-token.ts`), and `getCurrentUser` already loads the User on every request. It also loads `passwordChangedAt` and turns away any cookie issued before it. `readSession` returns the issue time alongside the email.

## 5. Data model

One migration, no new table:

- `PasswordResetToken.accountId` becomes optional. A new optional `userId` points to User (deleted with the User) and is indexed. A CHECK constraint makes exactly one of the two set.
- `User.passwordChangedAt DateTime?`, named like `PortalAccount.passwordChangedAt`.

No new table, so no RLS step.

## 6. Reuse check

**Reused as is:** the forgot page and form, the reset page and form, the `/login/reset/submit` route, the reset limits and advisory locks, token generation and hashing, `renderPlainEmail`, `sendEmail`, `deliverResetEmail`, the password rules (`checkNewPassword`), the login throttle, the "Password changed" notice and `SecurityEvent.userId`.

**Extended:** `PasswordResetToken` (its owner can be a User), User (`passwordChangedAt`), `startPasswordReset`, `findUsableToken` and `finishPasswordReset` (a staff branch each), `readSession` (returns the issue time) and `getCurrentUser` (turns away older cookies).

**New:** only the migration. Ending sessions after a reset follows the contractor reset already in the app, which revokes every session, and the [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), which recommends ending existing sessions once a password is reset.

## 7. Tests

- A staff email gets a token and an email. An unknown email, a User with no password and a disabled contractor get none. Staff requests count against the same limits.
- A staff reset sets the hash and `passwordChangedAt`, and its token works once.
- A staff cookie issued before `passwordChangedAt` is turned away; one issued after is accepted. A User who never reset is unaffected.
- The contractor tests pass unchanged.
- `npm run typecheck`, `npm run lint`, `npm test`, then the device check, since comment lines under `src/app/login/` change.

## 8. Docs to update in the build

- README Runbook, "Change a password": use Forgot password. Locally, `npm run db:dev-passwords` still works, and with no Resend key the link prints in the dev server's console.
- [asana-migration-plan.md](../asana-migration-plan.md), default 2: note that staff joined on Nov 16.
- The comments in `src/app/login/forgot/page.tsx`, `src/lib/portal/reset.ts` and `src/app/login/reset/submit/route.ts` that say contractors only.

## 9. Not in this

- A Change password page for staff inside the app. A reset by email covers it for now.
- Turning a staff login off from the app. It stays a database edit (call 1).
- Two-step sign-in for the app itself.
