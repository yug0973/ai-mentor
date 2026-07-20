/*
  Warnings:

  - A unique constraint covering the columns `[engine_session_id]` on the table `interview_sessions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[engine_roadmap_id]` on the table `roadmaps` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "interview_sessions" ADD COLUMN     "engine_session_id" TEXT;

-- AlterTable
ALTER TABLE "nudges_log" ADD COLUMN     "suggested_action" TEXT;

-- AlterTable
ALTER TABLE "roadmaps" ADD COLUMN     "engine_roadmap_id" TEXT,
ADD COLUMN     "generated_from_profile_version" TEXT;

-- CreateTable
CREATE TABLE "engine_feedback_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "outcome_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engine_feedback_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engine_feedback_events_user_id_idx" ON "engine_feedback_events"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_sessions_engine_session_id_key" ON "interview_sessions"("engine_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "roadmaps_engine_roadmap_id_key" ON "roadmaps"("engine_roadmap_id");

-- AddForeignKey
ALTER TABLE "engine_feedback_events" ADD CONSTRAINT "engine_feedback_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
