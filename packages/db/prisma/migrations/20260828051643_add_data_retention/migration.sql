-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "dataRetentionMonths" INTEGER;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "clientId" TEXT;
