-- New task's files before Create, and the task each form made (docs/specs/new-task-checklist-photos.md).

-- CreateTable
CREATE TABLE "NewTaskUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "thumbPathname" TEXT,
    "posterPathname" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewTaskUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewTaskForm" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewTaskForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewTaskUpload_pathname_key" ON "NewTaskUpload"("pathname");

-- CreateIndex
CREATE INDEX "NewTaskUpload_formId_idx" ON "NewTaskUpload"("formId");

-- CreateIndex
CREATE INDEX "NewTaskUpload_userId_formId_idx" ON "NewTaskUpload"("userId", "formId");

-- CreateIndex
CREATE INDEX "NewTaskUpload_createdAt_idx" ON "NewTaskUpload"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewTaskForm_taskId_key" ON "NewTaskForm"("taskId");

-- CreateIndex
CREATE INDEX "NewTaskForm_userId_idx" ON "NewTaskForm"("userId");

-- AddForeignKey
ALTER TABLE "NewTaskUpload" ADD CONSTRAINT "NewTaskUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewTaskForm" ADD CONSTRAINT "NewTaskForm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewTaskForm" ADD CONSTRAINT "NewTaskForm_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS on every new table (see 20260901200000_enable_row_level_security for why
-- zero policies is right; src/lib/db-rls.test.ts enforces this).
ALTER TABLE "NewTaskUpload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NewTaskForm" ENABLE ROW LEVEL SECURITY;
