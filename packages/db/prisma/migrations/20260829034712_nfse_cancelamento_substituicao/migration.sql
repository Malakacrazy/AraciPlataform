-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "nfseCanceladaEm" TIMESTAMP(3),
ADD COLUMN     "nfseChaveAcessoAnterior" TEXT,
ADD COLUMN     "nfseJustificativaCancelamento" TEXT,
ADD COLUMN     "nfseMotivoCancelamento" INTEGER;
