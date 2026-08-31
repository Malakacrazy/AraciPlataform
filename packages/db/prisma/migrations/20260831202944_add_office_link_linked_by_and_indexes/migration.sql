-- AlterTable
ALTER TABLE "OfficeLink" ADD COLUMN     "linkedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "OfficeLink_phaseId_brokenAt_idx" ON "OfficeLink"("phaseId", "brokenAt");

-- AddForeignKey
ALTER TABLE "OfficeLink" ADD CONSTRAINT "OfficeLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Achado A36 da auditoria de 30 ago 2026: ensureProjectFolderTree não é
-- atômico -- duas chamadas concorrentes liam o mesmo estado vazio e
-- ambas criavam a pasta. Um @@unique comum em (accountId, entityType,
-- entityId, documentType, phaseId) não bastaria: phaseId é NULL pra
-- pasta_projeto, e o Postgres trata cada NULL como distinto num índice
-- único comum, então duas pastas raiz continuariam passando. Índice
-- único PARCIAL (só quando documentType é um dos dois tipos de pasta,
-- onde phaseId é sempre NULL ou sempre preenchido dentro do mesmo tipo)
-- -- não representável em @@unique do schema.prisma, por isso SQL puro
-- em vez de uma declaração no schema.
CREATE UNIQUE INDEX "OfficeLink_unique_pasta_projeto"
  ON "OfficeLink" ("accountId", "entityId")
  WHERE "documentType" = 'pasta_projeto';

CREATE UNIQUE INDEX "OfficeLink_unique_pasta_fase"
  ON "OfficeLink" ("accountId", "phaseId")
  WHERE "documentType" = 'pasta_fase';
