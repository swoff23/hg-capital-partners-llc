-- Rehab draws (docs/specs/rehab-draws.md). Additive: two enums and five new
-- tables. Nothing is backfilled; partners set rehabs up in the app, by hand or
-- from the lender's worksheet. Roll forward only.

CREATE TYPE "RehabSource" AS ENUM ('APP', 'WORKSHEET');

CREATE TYPE "DrawStage" AS ENUM ('DRAFT', 'SENT', 'INSPECTION', 'APPROVED', 'FUNDED');

CREATE TABLE "Rehab" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lender" TEXT,
    "holdback" DECIMAL(12,2),
    "notes" TEXT,
    "source" "RehabSource" NOT NULL DEFAULT 'APP',
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "Rehab_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RehabProperty" (
    "rehabId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,

    CONSTRAINT "RehabProperty_pkey" PRIMARY KEY ("rehabId","propertyId")
);

CREATE TABLE "RehabLine" (
    "id" TEXT NOT NULL,
    "rehabId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "unitId" TEXT,
    "unitLabel" TEXT,
    "name" TEXT NOT NULL,
    "original" DECIMAL(12,2) NOT NULL,
    "changeOrder" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "RehabLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Draw" (
    "id" TEXT NOT NULL,
    "rehabId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "stage" "DrawStage" NOT NULL DEFAULT 'DRAFT',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentOn" TIMESTAMP(3),
    "sentAmount" DECIMAL(12,2),
    "approvedOn" TIMESTAMP(3),
    "approvedAmount" DECIMAL(12,2),
    "fundedOn" TIMESTAMP(3),
    "fundedAmount" DECIMAL(12,2),
    "waitingOnUs" BOOLEAN NOT NULL DEFAULT false,
    "waitingNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draw_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrawLine" (
    "drawId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "DrawLine_pkey" PRIMARY KEY ("drawId","lineId")
);

CREATE INDEX "Rehab_doneAt_idx" ON "Rehab"("doneAt");

CREATE INDEX "RehabProperty_propertyId_idx" ON "RehabProperty"("propertyId");

CREATE INDEX "RehabLine_rehabId_position_idx" ON "RehabLine"("rehabId", "position");

CREATE UNIQUE INDEX "Draw_rehabId_number_key" ON "Draw"("rehabId", "number");

CREATE INDEX "DrawLine_lineId_idx" ON "DrawLine"("lineId");

ALTER TABLE "Rehab" ADD CONSTRAINT "Rehab_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RehabProperty" ADD CONSTRAINT "RehabProperty_rehabId_fkey" FOREIGN KEY ("rehabId") REFERENCES "Rehab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RehabProperty" ADD CONSTRAINT "RehabProperty_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RehabLine" ADD CONSTRAINT "RehabLine_rehabId_fkey" FOREIGN KEY ("rehabId") REFERENCES "Rehab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Draw" ADD CONSTRAINT "Draw_rehabId_fkey" FOREIGN KEY ("rehabId") REFERENCES "Rehab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DrawLine" ADD CONSTRAINT "DrawLine_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DrawLine" ADD CONSTRAINT "DrawLine_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "RehabLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one open draft per rehab: the service keeps one, and this stops a second.
CREATE UNIQUE INDEX "Draw_one_draft" ON "Draw"("rehabId") WHERE "stage" = 'DRAFT';

-- Every new table gets row-level security (README, Rules of the road). The app
-- reads it as the table owner, which RLS doesn't restrict; nothing else may.
ALTER TABLE "Rehab" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RehabProperty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RehabLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Draw" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrawLine" ENABLE ROW LEVEL SECURITY;
