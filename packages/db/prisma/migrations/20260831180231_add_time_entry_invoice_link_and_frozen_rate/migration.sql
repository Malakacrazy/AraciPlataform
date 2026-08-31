-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "approvedHourlyRate" DECIMAL(65,30),
ADD COLUMN     "invoiceId" TEXT;

-- CreateIndex
CREATE INDEX "TimeEntry_invoiceId_idx" ON "TimeEntry"("invoiceId");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
