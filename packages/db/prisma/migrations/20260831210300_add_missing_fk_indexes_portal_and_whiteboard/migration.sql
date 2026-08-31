-- CreateIndex
CREATE INDEX "ClientMagicLink_clientId_idx" ON "ClientMagicLink"("clientId");

-- CreateIndex
CREATE INDEX "ClientSession_clientId_idx" ON "ClientSession"("clientId");

-- CreateIndex
CREATE INDEX "Moodboard_projectId_idx" ON "Moodboard"("projectId");

-- CreateIndex
CREATE INDEX "MoodboardComment_moodboardId_idx" ON "MoodboardComment"("moodboardId");

-- CreateIndex
CREATE INDEX "WhiteboardGuest_accountId_idx" ON "WhiteboardGuest"("accountId");

-- CreateIndex
CREATE INDEX "WhiteboardGuestAccess_moodboardId_idx" ON "WhiteboardGuestAccess"("moodboardId");

-- CreateIndex
CREATE INDEX "WhiteboardGuestSession_guestId_idx" ON "WhiteboardGuestSession"("guestId");
