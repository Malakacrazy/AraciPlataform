-- CreateTable
CREATE TABLE "RequiredDocumentType" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "stage" "ProjectStageName" NOT NULL,
    "documentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequiredDocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequiredDocumentType_accountId_stage_documentType_key" ON "RequiredDocumentType"("accountId", "stage", "documentType");

-- AddForeignKey
ALTER TABLE "RequiredDocumentType" ADD CONSTRAINT "RequiredDocumentType_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
