-- CreateTable
CREATE TABLE "GoogleCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "refreshTokenIv" TEXT NOT NULL,
    "refreshTokenTag" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCredential_userId_key" ON "GoogleCredential"("userId");

-- AddForeignKey
ALTER TABLE "GoogleCredential" ADD CONSTRAINT "GoogleCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
