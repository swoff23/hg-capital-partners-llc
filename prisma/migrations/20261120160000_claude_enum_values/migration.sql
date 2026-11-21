-- Tasks from Claude (docs/specs/tasks-from-claude.md): the new enum values.
--
-- On its own on purpose, like 20261023000000_task_status_values: Postgres
-- can't use an enum value in the same transaction that added it (error
-- 55P04), so nothing in this file may reference the new values. The next
-- migration can.
--
-- Roll forward only once this has shipped: a deploy built before it can't
-- read a Task in DRAFT. No row uses any of these until the connector is
-- switched on (CLAUDE_CONNECTOR_ENABLED).

ALTER TYPE "TaskStatus" ADD VALUE 'DRAFT';
ALTER TYPE "EventSource" ADD VALUE 'CLAUDE';
ALTER TYPE "SecurityEventKind" ADD VALUE 'CLAUDE_CONNECTED';
ALTER TYPE "SecurityEventKind" ADD VALUE 'CLAUDE_DISCONNECTED';
