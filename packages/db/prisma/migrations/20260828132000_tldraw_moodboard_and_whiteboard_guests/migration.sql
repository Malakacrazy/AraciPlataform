-- DropForeignKey
ALTER TABLE "MoodboardItem" DROP CONSTRAINT "MoodboardItem_moodboardId_fkey";

-- DropForeignKey
ALTER TABLE "MoodboardItem" DROP CONSTRAINT "MoodboardItem_productId_fkey";

-- AlterTable
ALTER TABLE "Moodboard" ADD COLUMN     "snapshot" JSONB;

-- DropTable
DROP TABLE "MoodboardItem";

-- CreateTable
CREATE TABLE "WhiteboardGuest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logtoSubjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhiteboardGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhiteboardGuestAccess" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "moodboardId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhiteboardGuestAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhiteboardGuestSession" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhiteboardGuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhiteboardGuest_email_key" ON "WhiteboardGuest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WhiteboardGuest_logtoSubjectId_key" ON "WhiteboardGuest"("logtoSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "WhiteboardGuestAccess_guestId_moodboardId_key" ON "WhiteboardGuestAccess"("guestId", "moodboardId");

-- CreateIndex
CREATE UNIQUE INDEX "WhiteboardGuestSession_token_key" ON "WhiteboardGuestSession"("token");

-- AddForeignKey
ALTER TABLE "WhiteboardGuest" ADD CONSTRAINT "WhiteboardGuest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhiteboardGuestAccess" ADD CONSTRAINT "WhiteboardGuestAccess_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "WhiteboardGuest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhiteboardGuestAccess" ADD CONSTRAINT "WhiteboardGuestAccess_moodboardId_fkey" FOREIGN KEY ("moodboardId") REFERENCES "Moodboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhiteboardGuestSession" ADD CONSTRAINT "WhiteboardGuestSession_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "WhiteboardGuest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
