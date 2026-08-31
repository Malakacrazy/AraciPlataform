-- CreateIndex
CREATE INDEX "CollaboratorMagicLink_collaboratorId_idx" ON "CollaboratorMagicLink"("collaboratorId");

-- CreateIndex
CREATE INDEX "CollaboratorProjectAccess_projectId_idx" ON "CollaboratorProjectAccess"("projectId");

-- CreateIndex
CREATE INDEX "CollaboratorSession_collaboratorId_idx" ON "CollaboratorSession"("collaboratorId");

-- CreateIndex
CREATE INDEX "ExternalCollaborator_accountId_idx" ON "ExternalCollaborator"("accountId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "StudioFixedCost_accountId_idx" ON "StudioFixedCost"("accountId");
