-- A task event for turning repeats on, changing them or turning them off
-- (docs/specs/activity-comments.md 2.3 rule 9 and question 1; build plan
-- section 1.1 row 7): "Connor set this to repeat every 2 weeks", "Connor
-- turned off repeats". Only patchTask writes it, and only when the rule
-- actually changes. REPEAT_CREATED ("Next repeat created") stays its own kind.
--
-- On its own on purpose: Postgres can't use an enum value in the same
-- transaction that added it (error 55P04), so nothing in this file may
-- reference REPEAT beyond adding it, and no other statement rides here. The
-- next migration can use it.
--
-- Additive only: one new enum value. Nothing is altered, dropped or renamed,
-- so today's code runs on it, and it must reach production before any code
-- writes the value. Nothing is backfilled: no existing event becomes REPEAT.
--
-- Roll forward only once this has shipped: a build from before it can't read
-- a task whose events include a REPEAT row.

-- AlterEnum
ALTER TYPE "TaskEventKind" ADD VALUE 'REPEAT';
