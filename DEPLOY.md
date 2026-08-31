# Deploying HG Capital OS — step by step

Goal: a real website Connor + Pieter log into with a password.

You only need **one account: Vercel** (it provides both the hosting and the
database). ~20 minutes. No coding.

---

## Step 1 — Put the code on GitHub

Open the **Terminal** app on your Mac (Cmd+Space, type "Terminal", Enter).
Paste this and press Enter:

```bash
cd /Users/connorswofford/dev/hg-capital-partners-llc && git push -u origin main
```

If it asks you to log in to GitHub, follow the prompts. When it finishes with
`branch 'main' set up to track 'origin/main'`, you're done. Close Terminal.

---

## Step 2 — Create the Vercel project

1. Go to **https://vercel.com/signup** and sign up with **"Continue with
   GitHub"** (use the account that owns the `hg-capital-partners-llc` repo).
2. On the dashboard, click **"Add New…" → "Project"**.
3. Find **`hg-capital-partners-llc`** in the list and click **"Import"**.
4. You'll see a "Configure Project" screen. **Don't change anything yet.** Scroll
   down and click **"Deploy"**.
5. The first deploy will **fail** — that's expected, there's no database yet.
   Keep going.

---

## Step 3 — Add the database

1. In your new project, click the **"Storage"** tab at the top.
2. Click **"Create Database"** → choose **"Neon"** (Postgres) → **"Continue"**.
3. Accept the defaults, pick the region closest to Buffalo (usually
   **Washington, D.C. (iad1)**), click **"Create"**.
4. When it asks to connect it to the project, say **yes / "Connect"**. This
   automatically adds the `DATABASE_URL` setting for you.

---

## Step 4 — Add the login settings

1. Click the **"Settings"** tab → **"Environment Variables"** in the left menu.
2. Add these three, one at a time (Name on the left, Value on the right, then
   "Save"):

   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | `PASTE_THE_RANDOM_STRING_CLAUDE_GIVES_YOU` |
   | `CONNOR_PASSWORD` | a password you choose for yourself |
   | `PIETER_PASSWORD` | a password you choose for Pieter |

   (Claude will give you the `SESSION_SECRET` value — it's a long random string.)
   These two password vars only matter once: the first production deploy hashes
   them into the database, and they're never read again after that — see
   "To change a password later" below.

---

## Step 5 — Deploy for real

1. Go to the **"Deployments"** tab.
2. Click the **"⋯"** menu on the most recent (failed) deployment →
   **"Redeploy"** → **"Redeploy"** again to confirm.
3. Wait ~2 minutes. When it says **"Ready"**, click **"Visit"**. You'll see the
   HG Capital OS login screen — but it has no data yet.

Copy your site's URL (like `hg-capital-partners-llc.vercel.app`).

> The live site is now also served at **https://www.hgcapitalpartners.com** — a
> custom domain added under Vercel → Settings → Domains, with the DNS records
> (`A @ → 216.198.79.1`, `CNAME www → *.vercel-dns-017.com`) set at GoDaddy on the
> `hgcapitalpartners.com` zone. The `.vercel.app` URL keeps working too.

---

## Step 6 — Load your data (Claude does this)

1. In Vercel: **Storage** tab → your database → **".env.local"** tab (or
   **"Connect"** button) → copy the value that starts with
   `postgresql://` (the `DATABASE_URL`).
2. Paste it to Claude and say "import the data into production."

Claude runs the import from your Mac (the spreadsheets live there, not on the
internet) and confirms the live site works.

---

## Step 7 — Sign in

Go to **https://www.hgcapitalpartners.com**. Pick your name, type the password
you set in Step 4, and you're in. Send Pieter the URL + his password.

---

## After this

- Every time Claude pushes a change, the site updates automatically in ~2 min.
- **Cost:** free to start. Vercel's free plan technically disallows commercial
  use — when you're ready to make it official, upgrade to Vercel Pro ($20/mo).
  The Neon database has a free tier that's plenty for now.
- To change a password later: passwords live in the database now, not in
  Vercel's env vars — editing `CONNOR_PASSWORD`/`PIETER_PASSWORD` after the
  first deploy has no effect. Just ask Claude to change it.
