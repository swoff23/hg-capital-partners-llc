-- Reply by email (docs/specs/contractor-job-emails.md, section 5): each job
-- email carries its own reply address, r+<token>@<sending domain>, whose token
-- is a JobLink of this new kind. It only lets a reply post to that job as the
-- person the email went to; it never opens the job.
--
-- Additive only: one enum value. The code in production never reads it.
ALTER TYPE "JobLinkKind" ADD VALUE 'REPLY';
