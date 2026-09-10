-- AlterTable
ALTER TABLE "Moodboard" ADD COLUMN     "scene" JSONB;

-- CreateTable
CREATE TABLE "MoodboardFile" (
    "id" TEXT NOT NULL,
    "moodboardId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoodboardFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoodboardFileBytes" (
    "storageKey" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoodboardFileBytes_pkey" PRIMARY KEY ("storageKey")
);

-- CreateIndex
CREATE INDEX "MoodboardFile_moodboardId_idx" ON "MoodboardFile"("moodboardId");

-- CreateIndex
CREATE INDEX "MoodboardFile_storageKey_idx" ON "MoodboardFile"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MoodboardFile_moodboardId_fileId_key" ON "MoodboardFile"("moodboardId", "fileId");

-- AddForeignKey
ALTER TABLE "MoodboardFile" ADD CONSTRAINT "MoodboardFile_moodboardId_fkey" FOREIGN KEY ("moodboardId") REFERENCES "Moodboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
