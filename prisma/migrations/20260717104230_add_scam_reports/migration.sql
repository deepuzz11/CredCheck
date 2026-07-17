-- CreateTable
CREATE TABLE "ScamReport" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScamReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScamReport_target_idx" ON "ScamReport"("target");

-- CreateIndex
CREATE INDEX "ScanCache_createdAt_idx" ON "ScanCache"("createdAt");
