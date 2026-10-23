-- Staff replies to one contractor stay with that contractor (UI/UX review
-- G2B-IV01). A Shared staff or system comment, status line or file records
-- the contractor assigned when it was written. The portal shows it to that
-- contractor only, or to anyone with access when no contractor was assigned
-- (src/lib/portal/queries.ts portalEvents and visibleFile).
--
-- Additive and nullable, no backfill. TaskEvent and TaskAttachment are
-- already in production (029c45d). A row written before this column existed
-- reads as "no contractor assigned", which is what the portal showed for it
-- before, and the production load writes only imported Asana rows, which
-- stay visible to the assignee (D17).
--
-- No foreign key on purpose: deleting a contact must not turn the staff
-- replies addressed to them visible to everyone, as ON DELETE SET NULL would.

ALTER TABLE "TaskEvent" ADD COLUMN "audienceContactId" TEXT;
ALTER TABLE "TaskAttachment" ADD COLUMN "audienceContactId" TEXT;
