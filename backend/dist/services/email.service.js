"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
let transporter = null;
function getTransporter() {
    if (!env_1.env.SMTP_HOST || !env_1.env.SMTP_USER || !env_1.env.SMTP_PASS) {
        return null;
    }
    if (!transporter) {
        transporter = nodemailer_1.default.createTransport({
            host: env_1.env.SMTP_HOST,
            port: env_1.env.SMTP_PORT,
            secure: env_1.env.SMTP_SECURE,
            auth: { user: env_1.env.SMTP_USER, pass: env_1.env.SMTP_PASS },
        });
    }
    return transporter;
}
async function sendEmail(to, subject, text) {
    const client = getTransporter();
    if (!client) {
        logger_1.logger.warn({ to }, "SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — email not sent");
        return false;
    }
    try {
        await client.sendMail({ from: env_1.env.SMTP_FROM, to, subject, text });
        return true;
    }
    catch (err) {
        logger_1.logger.error({ err, to }, "Failed to send email");
        return false;
    }
}
//# sourceMappingURL=email.service.js.map