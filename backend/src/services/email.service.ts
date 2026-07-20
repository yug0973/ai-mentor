import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }

  return transporter;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const client = getTransporter();

  if (!client) {
    logger.warn(
      { to },
      "SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — email not sent"
    );
    return false;
  }

  try {
    await client.sendMail({ from: env.SMTP_FROM, to, subject, text });
    return true;
  } catch (err) {
    logger.error({ err, to }, "Failed to send email");
    return false;
  }
}
