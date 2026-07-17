-- CreateEnum
CREATE TYPE "ScamReportStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "ScamReport" ADD COLUMN     "status" "ScamReportStatus" NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "ScamReport_status_idx" ON "ScamReport"("status");
