"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCronJobs = registerCronJobs;
const nudges_cron_1 = require("./nudges.cron");
const weeklyReview_cron_1 = require("./weeklyReview.cron");
function registerCronJobs() {
    (0, nudges_cron_1.scheduleNudgeCheck)();
    (0, weeklyReview_cron_1.scheduleWeeklyReview)();
}
//# sourceMappingURL=index.js.map