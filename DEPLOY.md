# Deploying HG Capital OS

Goal: a real URL Connor + Pieter sign into with a magic link. ~30 min.

Stack: **Supabase** (Postgres + auth email) + **Vercel** (hosting). Both have
free tiers; see "Cost" at the bottom.

---

## 1. Push the repo (Connor)

```bash
cd /Users/connorswofford/dev/hg-capital-partners-llc
git push -u origin main
```

Repo: `https://github.com/swoff23/hg-capital-partners-llc`

---

## 2. Create the Supabase project (Connor)

1. https://supabase.com → new project. Name it `hg-capital-os`. **Save the
   database password** it makes you set.
2. Once it's provisioned, collect four values:
   - **Project Settings → API**
     - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
     - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` key (click reveal) → `SUPABASE_SERVICE_ROLE_KEY`
   - **Project Settings → Database → Connection string → "URI"** (tab: *Session
     pooler*). Copy it and put your DB password in place of `[YOUR-PASSWORD]` →
     `DATABASE_URL`
3. **Authentication → URL Configuration**
   - Site URL: `https://<your-vercel-domain>` (fill in after step 3; can edit later)
   - Redirect URLs: add `https://<your-vercel-domain>/auth/callback`
4. **Authentication → Providers → Email** — make sure it's enabled (it is by
   default). Nothing else to configure — Supabase sends the magic-link emails.

---

## 3. Deploy on Vercel (Connor)

1. https://vercel.com → Add New → Project → import
   `swoff23/hg-capital-partners-llc`.
2. Framework preset: Next.js (auto-detected). Don't change build settings.
3. **Environment Variables** — add all four from step 2:
   ```
   DATABASE_URL
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ```
4. Deploy. First build runs `prisma migrate deploy` (creates the tables) then
   `next build`.
5. Copy the deployment URL (e.g. `hg-capital-os.vercel.app`) back into Supabase
   → Authentication → URL Configuration (Site URL + Redirect URL from step 2.3).

---

## 4. Load the data + users (Claude, one time)

The spreadsheets aren't in git, so the import runs from Connor's machine against
the production database:

```bash
cd /Users/connorswofford/dev/hg-capital-partners-llc
DATABASE_URL='<the Supabase URI from step 2>' npm run migrate
```

This seeds the two users and imports deals / properties / contractors / tasks.
Hand Claude the `DATABASE_URL` and it will run this + verify the live site.

---

## 5. Sign in

Go to the Vercel URL → enter `connoraswofford@gmail.com` or
`pieter@queencitycorp.com` → click the link in the email. Anyone else's email is
rejected (allowlist in `src/lib/auth-allowlist.ts`).

---

## Cost

| | Free tier | When to upgrade |
|---|---|---|
| Supabase | 500 MB DB, pauses after 7 days idle | Pro $25/mo removes the pause — worth it once Pieter relies on it |
| Vercel | Hobby; ToS disallows commercial use | Pro $20/mo, or move hosting to Cloudflare Pages (free, commercial-OK) |

Start free to confirm it works; plan on ~$25–45/mo for a "always on, legit"
setup.

## Redeploys

Every `git push` to `main` auto-deploys. Schema changes: add a migration
locally (`npm run db:migrate`), commit, push — the build applies it.
