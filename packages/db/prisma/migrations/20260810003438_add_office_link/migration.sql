-- CreateEnum
CREATE TYPE "OfficeLinkProvider" AS ENUM ('DRIVE', 'CALENDAR');

-- CreateEnum
CREATE TYPE "OfficeLinkEntityType" AS ENUM ('PROJECT', 'CLIENT');

-- CreateTable
CREATE TABLE "OfficeLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entityType" "OfficeLinkEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "provider" "OfficeLinkProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeLink_accountId_entityType_entityId_idx" ON "OfficeLink"("accountId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "OfficeLink" ADD CONSTRAINT "OfficeLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
