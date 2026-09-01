-- Enable row level security on every table in `public`.
--
-- Why: Supabase exposes the `public` schema through PostgREST, so any table
-- there is reachable with the project's `anon` key unless RLS is on. The
-- database linter flags this as `rls_disabled_in_public` (ERROR, EXTERNAL) on
-- all 19 tables, plus `sensitive_columns_exposed` on LedgerLine/QboAccount
-- (their `treatment` column trips the linter's PII pattern).
--
-- Why no policies: this app never talks to PostgREST. Every query goes through
-- Prisma over a direct Postgres connection as `postgres`, which OWNS these
-- tables — and a table owner bypasses RLS unless the table is also set to
-- FORCE ROW LEVEL SECURITY, which it is not. So RLS with zero policies is a
-- no-op for the app and a default-deny for `anon`/`authenticated`.
--
-- Do NOT add `FORCE ROW LEVEL SECURITY` here: that applies RLS to the owner
-- too, and with no policies it would make every app query return nothing.
-- If this app ever adds Supabase Auth + client-side queries, add explicit
-- policies then — the deny-all default is what you want to start from.
--
-- New tables are not covered automatically. Any future migration that adds a
-- table must enable RLS on it too; src/lib/db-rls.test.ts fails the build if
-- one is missed.

ALTER TABLE "AppConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LedgerLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Listing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ListingPhoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PropertyAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QboAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QboClass" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QboEntity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QboSyncRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QboVendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuickbooksConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Prisma's own bookkeeping table. It exists before this migration runs (the
-- migrate engine creates it first), and the linter flags it like any other.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
