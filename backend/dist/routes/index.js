"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const profile_routes_1 = __importDefault(require("./profile.routes"));
const interview_routes_1 = __importDefault(require("./interview.routes"));
const roadmap_routes_1 = __importDefault(require("./roadmap.routes"));
const session_routes_1 = __importDefault(require("./session.routes"));
const nudge_routes_1 = __importDefault(require("./nudge.routes"));
const review_routes_1 = __importDefault(require("./review.routes"));
const push_routes_1 = __importDefault(require("./push.routes"));
const feedback_routes_1 = __importDefault(require("./feedback.routes"));
const router = (0, express_1.Router)();
router.use("/auth", auth_routes_1.default);
router.use("/profile", profile_routes_1.default);
router.use("/interview", interview_routes_1.default);
router.use("/roadmap", roadmap_routes_1.default);
router.use("/sessions", session_routes_1.default);
router.use("/nudges", nudge_routes_1.default);
router.use("/reviews", review_routes_1.default);
router.use("/push", push_routes_1.default);
router.use("/feedback", feedback_routes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map