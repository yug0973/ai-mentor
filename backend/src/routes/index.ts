import { Router } from "express";
import authRoutes from "./auth.routes";
import profileRoutes from "./profile.routes";
import interviewRoutes from "./interview.routes";
import roadmapRoutes from "./roadmap.routes";
import sessionRoutes from "./session.routes";
import nudgeRoutes from "./nudge.routes";
import reviewRoutes from "./review.routes";
import pushRoutes from "./push.routes";
import feedbackRoutes from "./feedback.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/profile", profileRoutes);
router.use("/interview", interviewRoutes);
router.use("/roadmap", roadmapRoutes);
router.use("/sessions", sessionRoutes);
router.use("/nudges", nudgeRoutes);
router.use("/reviews", reviewRoutes);
router.use("/push", pushRoutes);
router.use("/feedback", feedbackRoutes);

export default router;
