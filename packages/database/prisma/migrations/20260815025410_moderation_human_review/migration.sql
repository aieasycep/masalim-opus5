-- AlterTable
ALTER TABLE "moderation_records" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewOutcome" "ModerationStatus",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByAdminId" TEXT;

-- CreateIndex
CREATE INDEX "moderation_records_reviewedAt_verdict_idx" ON "moderation_records"("reviewedAt", "verdict");

-- AddForeignKey
ALTER TABLE "moderation_records" ADD CONSTRAINT "moderation_records_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
