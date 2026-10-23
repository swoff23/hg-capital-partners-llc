-- Seven task states (docs/asana-migration-plan.md D6). OPEN stays and is
-- shown as "To do".
--
-- On its own on purpose: Postgres can't use an enum value in the same
-- transaction that added it (error 55P04), so nothing in this file may
-- reference the new values. The next migration can.
--
-- Roll forward only once this has shipped: a deploy built before it can't
-- read rows that use these values.

ALTER TYPE "TaskStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "TaskStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TaskStatus" ADD VALUE 'WAITING';
ALTER TYPE "TaskStatus" ADD VALUE 'REVIEW';
ALTER TYPE "TaskStatus" ADD VALUE 'CANCELED';
