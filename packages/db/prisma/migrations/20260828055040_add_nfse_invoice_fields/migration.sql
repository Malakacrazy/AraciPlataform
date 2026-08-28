-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "nfseAmbiente" TEXT NOT NULL DEFAULT 'homologacao';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "nfseAmbienteEmissao" TEXT,
ADD COLUMN     "nfseChaveAcesso" TEXT,
ADD COLUMN     "nfseIdDps" TEXT,
ADD COLUMN     "nfseNumeroDps" TEXT,
ADD COLUMN     "nfseRejectionReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_nfseChaveAcesso_key" ON "Invoice"("nfseChaveAcesso");
