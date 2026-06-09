-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'DELETED');

-- AlterTable
ALTER TABLE "comments"
  ADD COLUMN "status" "CommentStatus" NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "hidden_at" TIMESTAMP(3),
  ADD COLUMN "moderation_reason" TEXT;

-- CreateIndex
CREATE INDEX "comments_note_id_status_created_at_idx" ON "comments"("note_id", "status", "created_at");
