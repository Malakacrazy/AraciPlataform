-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "asaasCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "asaasPaymentId" TEXT,
ADD COLUMN     "asaasInvoiceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_asaasCustomerId_key" ON "Client"("asaasCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_asaasPaymentId_key" ON "Invoice"("asaasPaymentId");
