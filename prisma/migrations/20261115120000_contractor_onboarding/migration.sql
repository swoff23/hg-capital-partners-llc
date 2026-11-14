-- Contractor onboarding (docs/specs/contractor-onboarding.md, approved by
-- Connor on Nov 14): personal invites and one shared sign-up link
-- (PortalInvite), a contractor's own W-9 and insurance files
-- (ContactDocument), and the setup fields on Contact.
--
-- Additive only: two tables, two enums and new Contact columns with defaults.
-- Every existing contact becomes signupSource STAFF, which is never in setup,
-- so nothing changes for anyone already in Contractors. It reaches production
-- through `prisma migrate deploy` in the production build's prebuild
-- (scripts/prebuild.mjs), before `next build`.

-- CreateEnum
CREATE TYPE "SignupSource" AS ENUM ('STAFF', 'INVITE', 'LINK');

-- CreateEnum
CREATE TYPE "ContactDocKind" AS ENUM ('W9', 'INSURANCE');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "baselaneSentAt" TIMESTAMP(3),
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noInsurance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setupDoneAt" TIMESTAMP(3),
ADD COLUMN     "setupStep" TEXT,
ADD COLUMN     "signupSource" "SignupSource" NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "tradesNote" TEXT;

-- CreateTable
CREATE TABLE "PortalInvite" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdByUserId" TEXT,
    "openedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactDocument" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" "ContactDocKind" NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT,
    "uploadedByContactId" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalInvite_tokenHash_key" ON "PortalInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalInvite_contactId_idx" ON "PortalInvite"("contactId");

-- CreateIndex
CREATE INDEX "PortalInvite_shared_idx" ON "PortalInvite"("shared");

-- CreateIndex
CREATE UNIQUE INDEX "ContactDocument_pathname_key" ON "ContactDocument"("pathname");

-- CreateIndex
CREATE INDEX "ContactDocument_contactId_kind_idx" ON "ContactDocument"("contactId", "kind");

-- AddForeignKey
ALTER TABLE "PortalInvite" ADD CONSTRAINT "PortalInvite_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvite" ADD CONSTRAINT "PortalInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDocument" ADD CONSTRAINT "ContactDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDocument" ADD CONSTRAINT "ContactDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Every new table gets row-level security (README, Rules of the road). The app
-- reads it as the table owner, which RLS doesn't restrict; nothing else may.
ALTER TABLE "PortalInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactDocument" ENABLE ROW LEVEL SECURITY;
