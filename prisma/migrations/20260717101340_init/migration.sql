-- CreateTable
CREATE TABLE "ScanCache" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanCache_normalizedKey_key" ON "ScanCache"("normalizedKey");

-- CreateIndex
CREATE INDEX "ScanCache_expiresAt_idx" ON "ScanCache"("expiresAt");
