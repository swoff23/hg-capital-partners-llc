-- "Email me a sign-in link" (docs/specs/contractor-scheduled-date.md section 12).
--
-- "PortalSignInLink": a one-time sign-in link a contractor on an email's job
-- link asks for from the Welcome back page. Sent only to the login's own
-- email, it works once, for 15 minutes, and opens a full session (My jobs).
-- Only the token's SHA-256 is stored; the token is only in the email.
--
-- Additive only: a new table. Nothing existing is altered, dropped, renamed or
-- tightened, so today's code runs on it, and it is safe on the production
-- database whenever prebuild's `prisma migrate deploy` applies it. Deleting a
-- login deletes its links (ON DELETE CASCADE).
--
-- RLS on, with no policies, as every table in `public` (README, Rules of the
-- road; 20260901200000_enable_row_level_security). Never FORCE: the app
-- connects as the table owner. src/lib/db-rls.test.ts checks both.

-- CreateTable
CREATE TABLE "PortalSignInLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalSignInLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalSignInLink_tokenHash_key" ON "PortalSignInLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalSignInLink_accountId_idx" ON "PortalSignInLink"("accountId");

-- AddForeignKey
ALTER TABLE "PortalSignInLink" ADD CONSTRAINT "PortalSignInLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortalSignInLink" ENABLE ROW LEVEL SECURITY;
