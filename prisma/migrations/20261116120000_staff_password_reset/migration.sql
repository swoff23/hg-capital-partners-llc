-- Staff password reset (docs/specs/staff-password-reset.md).
--
-- 1. "PasswordResetToken" can belong to a staff User as well as a contractor
--    login: "accountId" becomes optional, "userId" is new, and a CHECK keeps
--    exactly one of them set.
-- 2. "User"."passwordChangedAt": set by a staff reset. src/lib/auth.ts turns
--    away a session cookie issued before it, which signs that partner out on
--    every device (staff sessions have no row to revoke).
--
-- No new table, so no RLS step. Every existing token has an accountId, so the
-- CHECK holds on today's rows. Nothing is dropped or renamed; today's code
-- runs on this schema, and it writes no staff token until the new code ships.

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "accountId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A rule Prisma can't express: a link has exactly one owner.
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_one_owner"
  CHECK (("accountId" IS NULL) <> ("userId" IS NULL));
