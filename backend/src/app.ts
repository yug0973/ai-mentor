import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { requestLogger } from "./middleware/requestLogger.middleware";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware";
import routes from "./routes";

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(requestLogger);

// Health check — useful for Docker/Railway/Render/Fly.io health probes
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Feature routes
app.use("/api", routes);

// 404 + error handling — must be registered last, in this order
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
