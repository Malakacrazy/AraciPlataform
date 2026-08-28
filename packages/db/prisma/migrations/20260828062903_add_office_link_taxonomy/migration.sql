-- AlterTable
ALTER TABLE "OfficeLink" ADD COLUMN     "brokenAt" TIMESTAMP(3),
ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "phaseId" TEXT,
ADD COLUMN     "visibleToClient" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "OfficeLink" ADD CONSTRAINT "OfficeLink_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
