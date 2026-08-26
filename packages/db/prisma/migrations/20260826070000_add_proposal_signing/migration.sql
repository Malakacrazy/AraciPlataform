-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Proposal" ADD COLUMN "previousVersionId" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "zapsignDocToken" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "zapsignSignUrl" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "signerName" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "opportunityId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_previousVersionId_key" ON "Proposal"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_zapsignDocToken_key" ON "Proposal"("zapsignDocToken");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
