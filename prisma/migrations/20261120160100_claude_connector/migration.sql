-- Tasks from Claude (docs/specs/tasks-from-claude.md, sections 7 and 8).
--
-- 1. "ClaudeConnection": one partner's Claude account, allowed to read the
--    directory and save draft tasks as that partner.
-- 2. "OAuthToken": the connector's sign-in tokens (codes, access tokens and
--    refresh tokens), stored only as SHA-256 hashes.
-- 3. "User"."claudeKeyId" and "claudeKeyHash": a partner's own connector
--    address, <APP_URL>/api/mcp/<key>. The key is rebuilt from the id and
--    the session secret; only its SHA-256 is stored.
-- 4. "Task"."discardedAt": a discarded draft, hidden at once and deleted
--    by the every-minute run about 10 minutes later.
--
-- All additive. Nothing is dropped or renamed, so today's code runs on this
-- schema. Both new tables enable RLS here (src/lib/db-rls.test.ts).

-- CreateEnum
CREATE TYPE "OAuthTokenKind" AS ENUM ('CODE', 'ACCESS', 'REFRESH');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "claudeKeyHash" TEXT,
ADD COLUMN     "claudeKeyId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "discardedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClaudeConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,

    CONSTRAINT "ClaudeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" "OAuthTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "codeChallenge" TEXT,
    "redirectUri" TEXT,
    "resource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_claudeKeyHash_key" ON "User"("claudeKeyHash");

-- CreateIndex
CREATE INDEX "ClaudeConnection_userId_idx" ON "ClaudeConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_tokenHash_key" ON "OAuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthToken_connectionId_idx" ON "OAuthToken"("connectionId");

-- CreateIndex
CREATE INDEX "OAuthToken_expiresAt_idx" ON "OAuthToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "ClaudeConnection" ADD CONSTRAINT "ClaudeConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ClaudeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase serves the public schema over PostgREST: lock both tables.
ALTER TABLE "ClaudeConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthToken" ENABLE ROW LEVEL SECURITY;
