import { Router } from "express";
import * as chatController from "../controllers/chat.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { sendChatMessageSchema } from "../types/chat.schema";

const router = Router();

router.use(requireAuth);

router.post("/message", validate(sendChatMessageSchema), chatController.sendMessage);
router.get("/history", chatController.history);

export default router;
