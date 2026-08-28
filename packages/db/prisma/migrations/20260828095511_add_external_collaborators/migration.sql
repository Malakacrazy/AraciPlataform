-- CreateTable
CREATE TABLE "ExternalCollaborator" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaboratorProjectAccess" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaboratorProjectAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaboratorMagicLink" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaboratorMagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaboratorSession" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaboratorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCollaborator_email_key" ON "ExternalCollaborator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CollaboratorProjectAccess_collaboratorId_projectId_key" ON "CollaboratorProjectAccess"("collaboratorId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaboratorMagicLink_token_key" ON "CollaboratorMagicLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CollaboratorSession_token_key" ON "CollaboratorSession"("token");

-- AddForeignKey
ALTER TABLE "ExternalCollaborator" ADD CONSTRAINT "ExternalCollaborator_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorProjectAccess" ADD CONSTRAINT "CollaboratorProjectAccess_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "ExternalCollaborator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorProjectAccess" ADD CONSTRAINT "CollaboratorProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorMagicLink" ADD CONSTRAINT "CollaboratorMagicLink_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "ExternalCollaborator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorSession" ADD CONSTRAINT "CollaboratorSession_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "ExternalCollaborator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
