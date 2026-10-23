-- Moving off Asana: task timeline, checklists, contractor portal, outbox.
-- See docs/asana-migration-plan.md §5.2. Additive only: every existing row
-- stays valid, and no column is dropped.

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('SHARED', 'INTERNAL');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'VIDEO', 'FILE', 'LINK');

-- CreateEnum
CREATE TYPE "TaskEventKind" AS ENUM ('COMMENT', 'CREATED', 'ASSIGNED', 'STATUS', 'DUE', 'SCHEDULED', 'PROPERTY', 'TITLE', 'NOTES', 'ATTACHMENT', 'CHECKLIST', 'ACCESS', 'REPEAT_CREATED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('APP', 'PORTAL', 'SYSTEM', 'ASANA');

-- CreateEnum
CREATE TYPE "AccessSource" AS ENUM ('ASSIGNEE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PortalAccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SecurityEventKind" AS ENUM ('SIGN_IN_OK', 'SIGN_IN_FAILED', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'SESSIONS_REVOKED', 'ACCOUNT_CREATED', 'ACCOUNT_DISABLED', 'LOCKBOX_VIEWED');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "asanaGid" TEXT,
ADD COLUMN     "phoneE164" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "appEditedAt" TIMESTAMP(3),
ADD COLUMN     "asanaLastSynced" JSONB,
ADD COLUMN     "asanaSyncedAt" TIMESTAMP(3),
ADD COLUMN     "assigneeContactId" TEXT,
ADD COLUMN     "completedByContactId" TEXT,
ADD COLUMN     "completedByUserId" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "repeatRule" JSONB,
ADD COLUMN     "repeatSeriesId" TEXT,
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "taskTemplateId" TEXT,
ADD COLUMN     "unitLabel" TEXT,
ADD COLUMN     "waitingOn" TEXT;

-- AlterTable
ALTER TABLE "TaskAttachment" ADD COLUMN     "asanaGid" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "durationSec" DOUBLE PRECISION,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "kind" "AttachmentKind" NOT NULL DEFAULT 'FILE',
ADD COLUMN     "linkUrl" TEXT,
ADD COLUMN     "posterPathname" TEXT,
ADD COLUMN     "thumbPathname" TEXT,
ADD COLUMN     "uploadedByContactId" TEXT,
ADD COLUMN     "uploadedByUserId" TEXT,
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "width" INTEGER,
ALTER COLUMN "url" DROP NOT NULL,
ALTER COLUMN "pathname" DROP NOT NULL,
ALTER COLUMN "size" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "asanaGid" TEXT;

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "TaskEventKind" NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'INTERNAL',
    "actorUserId" TEXT,
    "actorContactId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "source" "EventSource" NOT NULL DEFAULT 'APP',
    "asanaStoryGid" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskChecklistItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneByUserId" TEXT,
    "doneByContactId" TEXT,
    "assigneeLabel" TEXT,
    "dueDate" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "asanaGid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskReadState" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskReadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "anchorLabel" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "sourceAsanaSectionGid" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAccess" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "source" "AccessSource" NOT NULL DEFAULT 'ASSIGNEE',
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccount" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "status" "PortalAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "lastSignInAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "kind" "SecurityEventKind" NOT NULL,
    "userId" TEXT,
    "contactId" TEXT,
    "taskId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "openKey" TEXT,
    "recipientUserId" TEXT,
    "recipientContactId" TEXT,
    "taskId" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendAfter" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskEvent_asanaStoryGid_key" ON "TaskEvent"("asanaStoryGid");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskChecklistItem_asanaGid_key" ON "TaskChecklistItem"("asanaGid");

-- CreateIndex
CREATE INDEX "TaskChecklistItem_taskId_position_idx" ON "TaskChecklistItem"("taskId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TaskReadState_taskId_userId_key" ON "TaskReadState"("taskId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskReadState_taskId_contactId_key" ON "TaskReadState"("taskId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplate_sourceAsanaSectionGid_key" ON "TaskTemplate"("sourceAsanaSectionGid");

-- CreateIndex
CREATE INDEX "TaskTemplate_archivedAt_idx" ON "TaskTemplate"("archivedAt");

-- CreateIndex
CREATE INDEX "TaskAccess_contactId_idx" ON "TaskAccess"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAccess_taskId_contactId_key" ON "TaskAccess"("taskId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_contactId_key" ON "PortalAccount"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_email_key" ON "PortalAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalSession_accountId_idx" ON "PortalSession"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_accountId_idx" ON "PasswordResetToken"("accountId");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_contactId_createdAt_idx" ON "SecurityEvent"("contactId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_openKey_key" ON "NotificationOutbox"("openKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_sentAt_sendAfter_idx" ON "NotificationOutbox"("sentAt", "sendAfter");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_asanaGid_key" ON "Contact"("asanaGid");

-- CreateIndex
CREATE INDEX "Task_assigneeContactId_idx" ON "Task"("assigneeContactId");

-- CreateIndex
CREATE INDEX "Task_repeatSeriesId_idx" ON "Task"("repeatSeriesId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_pathname_key" ON "TaskAttachment"("pathname");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_asanaGid_key" ON "TaskAttachment"("asanaGid");

-- CreateIndex
CREATE INDEX "TaskAttachment_eventId_idx" ON "TaskAttachment"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "User_asanaGid_key" ON "User"("asanaGid");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeContactId_fkey" FOREIGN KEY ("assigneeContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedByContactId_fkey" FOREIGN KEY ("completedByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TaskEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedByContactId_fkey" FOREIGN KEY ("uploadedByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actorContactId_fkey" FOREIGN KEY ("actorContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_doneByContactId_fkey" FOREIGN KEY ("doneByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReadState" ADD CONSTRAINT "TaskReadState_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReadState" ADD CONSTRAINT "TaskReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReadState" ADD CONSTRAINT "TaskReadState_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAccess" ADD CONSTRAINT "TaskAccess_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAccess" ADD CONSTRAINT "TaskAccess_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAccess" ADD CONSTRAINT "TaskAccess_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_recipientContactId_fkey" FOREIGN KEY ("recipientContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: existing uploads get a kind from their content type. Visibility
-- already defaulted to INTERNAL above, so nothing old reaches a contractor.
UPDATE "TaskAttachment" SET "kind" = 'IMAGE' WHERE "contentType" LIKE 'image/%';
UPDATE "TaskAttachment" SET "kind" = 'VIDEO' WHERE "contentType" LIKE 'video/%';

-- Rules Prisma can't express.
-- A task is assigned to a staff user or a contractor, never both.
ALTER TABLE "Task" ADD CONSTRAINT "Task_one_assignee"
  CHECK (NOT ("assigneeUserId" IS NOT NULL AND "assigneeContactId" IS NOT NULL));
-- An event, upload or tick has at most one actor.
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_one_actor"
  CHECK (NOT ("actorUserId" IS NOT NULL AND "actorContactId" IS NOT NULL));
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_one_uploader"
  CHECK (NOT ("uploadedByUserId" IS NOT NULL AND "uploadedByContactId" IS NOT NULL));
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_one_checker"
  CHECK (NOT ("doneByUserId" IS NOT NULL AND "doneByContactId" IS NOT NULL));
-- Only a LINK may lack stored bytes.
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_bytes_unless_link"
  CHECK ("kind" = 'LINK' OR ("url" IS NOT NULL AND "pathname" IS NOT NULL AND "size" IS NOT NULL));
-- Read state and outbox rows belong to exactly one person.
ALTER TABLE "TaskReadState" ADD CONSTRAINT "TaskReadState_one_reader"
  CHECK (("userId" IS NULL) <> ("contactId" IS NULL));
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_one_recipient"
  CHECK (("recipientUserId" IS NULL) <> ("recipientContactId" IS NULL));

-- RLS on every new table (see 20260901200000_enable_row_level_security for why
-- zero policies is right; src/lib/db-rls.test.ts enforces this).
ALTER TABLE "TaskEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskReadState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecurityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationOutbox" ENABLE ROW LEVEL SECURITY;
