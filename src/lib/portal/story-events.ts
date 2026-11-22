import { Prisma } from "@prisma/client";
import { STORY_STATUSES } from "./job-view";

/**
 * The job's own story on a contractor's Updates (docs/specs/contractor-timeline.md,
 * option A): added, given to them, the due date and scheduled day, a move to
 * To do, Waiting or Canceled, notes edited and checklist edits. These are
 * system lines, saved Internal, so there's no visibility test; the rest is
 * portalEvents' own audience rule: theirs, or staff's and the system's
 * addressed to them or to nobody in particular, never another contractor's.
 * Never Asana's history, and never a draft's Add. The rest shows only from
 * a time the job was theirs: date, notes and checklist lines carry no
 * audience (core.ts addEvent), so only the time tells a date moved while it
 * was someone else's. Every line is from after their access row (a re-grant
 * keeps its first createdAt, core.ts writeAssigneeAccess), and whose the job
 * was at a line's moment is the latest assignment at or before it (an
 * ASSIGNED line, or the job's CREATED line when it was added with an
 * assignee), which must name them. So a job handed away and back, or an
 * assignment undone, keeps every stretch that was theirs and none that
 * wasn't. Two lines come from outside those stretches, since they name
 * nobody: the job being added, and each assignment that gave it to this
 * contractor; one naming someone else never shows. Only the job page's
 * Updates read it: the "2 new" counts and the notice keep portalEvents
 * (call 3), and jobUpdates reads only the fields a line needs (never
 * Waiting's reason, call 2).
 *
 * Its own module, with no server-only import, so story-events.pg.test.ts runs
 * this same SQL on a real database (queries.ts can't load under node:test).
 */
export const storyEvents = (contactId: string) => Prisma.sql`(
  e."deletedAt" IS NULL
  AND e."source" <> 'ASANA'
  AND (
    (e."kind" = 'CREATED' AND e."actorContactId" IS NULL)
    OR (e."kind" = 'ASSIGNED' AND e."actorContactId" IS NULL AND e."data"->'to'->>'contactId' = ${contactId})
    OR (
      (e."actorContactId" = ${contactId} OR (e."actorContactId" IS NULL AND (e."audienceContactId" IS NULL OR e."audienceContactId" = ${contactId})))
      -- Never before they first had it (a re-grant keeps the row's first createdAt), and never while it was someone
      -- else's: the latest assignment at or before this line must name them. Asana's own lines don't count (its
      -- history is never shown, and the sync no longer runs: Connor, Nov 20), so a job imported from Asana, or added
      -- unassigned, has only the access row to go by.
      AND e."createdAt" >= (SELECT a."createdAt" FROM "TaskAccess" a
        WHERE a."taskId" = e."taskId" AND a."contactId" = ${contactId} AND a."revokedAt" IS NULL)
      AND COALESCE(
        (SELECT (COALESCE(x."data"->'to', 'null'::jsonb)->>'contactId') IS NOT DISTINCT FROM ${contactId}
          FROM "TaskEvent" x
          WHERE x."taskId" = e."taskId" AND x."deletedAt" IS NULL AND x."source" <> 'ASANA' AND x."createdAt" <= e."createdAt"
            AND (x."kind" = 'ASSIGNED' OR (x."kind" = 'CREATED' AND x."data" ? 'to'))
          ORDER BY x."createdAt" DESC, x."id" DESC
          LIMIT 1),
        TRUE
      )
      AND (
        e."kind" IN ('DUE', 'SCHEDULED', 'NOTES', 'CHECKLIST')
        OR (e."kind" = 'STATUS' AND e."data"->>'to' IN (${Prisma.join([...STORY_STATUSES])}) AND e."data"->>'from' IS DISTINCT FROM 'DRAFT')
      )
    )
  )
)`;
