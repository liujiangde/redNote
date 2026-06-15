-- User moderation status for basic account banning.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED');

ALTER TABLE "users"
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "users_status_idx" ON "users"("status");
