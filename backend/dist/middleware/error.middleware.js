"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
exports.errorHandler = errorHandler;
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../config/logger");
// 404 handler — placed after all routes.
function notFoundHandler(req, res) {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}
// Global error handler — must be the LAST middleware registered.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err, req, res, next) {
    if (err instanceof AppError_1.AppError) {
        return res.status(err.statusCode).json({ error: err.message });
    }
    logger_1.logger.error({ err }, "Unhandled error");
    return res.status(500).json({ error: "Internal server error" });
}
//# sourceMappingURL=error.middleware.js.map