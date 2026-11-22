-- "Email me a sign-in link" (docs/specs/contractor-scheduled-date.md section 12): the request's audit row.
--
-- On its own on purpose, like 20261120160000_claude_enum_values: Postgres
-- can't use an enum value in the same transaction that added it (error
-- 55P04), so nothing in this file may reference the new value. The next
-- migration doesn't need it either; the app writes it.
--
-- Additive only. A deploy built before it never writes or reads the value.

ALTER TYPE "SecurityEventKind" ADD VALUE 'SIGN_IN_LINK_REQUESTED';
