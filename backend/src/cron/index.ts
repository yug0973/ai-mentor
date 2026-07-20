import { scheduleNudgeCheck } from "./nudges.cron";
import { scheduleWeeklyReview } from "./weeklyReview.cron";

export function registerCronJobs() {
  scheduleNudgeCheck();
  scheduleWeeklyReview();
}
