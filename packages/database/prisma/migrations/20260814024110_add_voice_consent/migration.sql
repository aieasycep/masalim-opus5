-- CreateTable
CREATE TABLE "voice_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "voice_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_consents_userId_version_revokedAt_idx" ON "voice_consents"("userId", "version", "revokedAt");

-- AddForeignKey
ALTER TABLE "voice_consents" ADD CONSTRAINT "voice_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
