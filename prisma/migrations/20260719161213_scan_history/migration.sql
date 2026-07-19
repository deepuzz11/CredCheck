-- CreateTable
CREATE TABLE "ScanHistory" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "trustScore" INTEGER NOT NULL,
    "riskBand" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanHistory_normalizedKey_createdAt_idx" ON "ScanHistory"("normalizedKey", "createdAt");

-- CreateIndex
CREATE INDEX "ScanHistory_createdAt_idx" ON "ScanHistory"("createdAt");
