-- Mail that isn't getting through (docs/specs/emails-redesign.md, section 5): Resend's webhook records a bounce, a
-- suppression or a spam report on the contractor's login or the partner it went to, and a later delivery clears it.
-- Columns on two existing tables, both already under RLS with no policies (only the app's own role reads them), so
-- nothing new to lock down. src/lib/email/delivery-events.ts is the only writer.

-- CreateEnum
CREATE TYPE "EmailProblem" AS ENUM ('BOUNCED', 'SUPPRESSED', 'COMPLAINED');

-- AlterTable
ALTER TABLE "PortalAccount" ADD COLUMN     "emailEventAt" TIMESTAMP(3),
ADD COLUMN     "emailEventTo" TEXT,
ADD COLUMN     "emailProblem" "EmailProblem";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailEventAt" TIMESTAMP(3),
ADD COLUMN     "emailEventTo" TEXT,
ADD COLUMN     "emailProblem" "EmailProblem";
