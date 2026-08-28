-- CreateTable
CREATE TABLE "MoodboardComment" (
    "id" TEXT NOT NULL,
    "moodboardId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoodboardComment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MoodboardComment" ADD CONSTRAINT "MoodboardComment_moodboardId_fkey" FOREIGN KEY ("moodboardId") REFERENCES "Moodboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
