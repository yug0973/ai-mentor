import { prisma } from "../config/prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { sendEmail } from "./email.service";
import { logger } from "../config/logger";
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiryDate,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "../utils/otp";
import {
  RegisterInput,
  LoginInput,
  VerifyOtpInput,
  ResendOtpInput,
} from "../types/auth.schema";

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber,
    createdAt: user.createdAt,
  };
}

async function issueAndSendOtp(userId: string, email: string, name: string) {
  const code = generateOtpCode();

  await prisma.$transaction(async (tx) => {
    // Invalidate any previous outstanding codes for this user.
    await tx.emailOtp.deleteMany({ where: { userId } });
    await tx.emailOtp.create({
      data: {
        userId,
        codeHash: hashOtpCode(code),
        expiresAt: otpExpiryDate(),
      },
    });
  });

  const sent = await sendEmail(
    email,
    "Your AI Mentor verification code",
    `Hi ${name},\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes.`
  );

  if (!sent) {
    // SMTP isn't configured yet (placeholder .env values) — don't block
    // the dev flow. Log it clearly so it's still testable end to end.
    logger.warn({ email, code }, "[auth] SMTP not configured — OTP code logged here for dev testing");
  }
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError("An account with this email already exists", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      phoneNumber: input.phoneNumber || null,
      emailVerified: false,
    },
  });

  await issueAndSendOtp(user.id, user.email, user.name);

  // No token yet — account isn't usable until the OTP is verified.
  return { email: user.email, message: "Verification code sent to your email" };
}

export async function verifyOtp(input: VerifyOtpInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError("Invalid email or code", 400);
  }

  if (user.emailVerified) {
    const token = signToken({ userId: user.id, email: user.email });
    return { user: toPublicUser(user), token };
  }

  const otp = await prisma.emailOtp.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    throw new AppError("No verification code found — request a new one", 400, "OTP_NOT_FOUND");
  }

  if (otp.expiresAt < new Date()) {
    throw new AppError("This code has expired — request a new one", 400, "OTP_EXPIRED");
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError("Too many incorrect attempts — request a new code", 429, "OTP_LOCKED");
  }

  if (hashOtpCode(input.code) !== otp.codeHash) {
    await prisma.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
    throw new AppError(`Incorrect code — ${remaining} attempt(s) remaining`, 400, "OTP_INCORRECT");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  await prisma.emailOtp.deleteMany({ where: { userId: user.id } });

  const token = signToken({ userId: updated.id, email: updated.email });
  return { user: toPublicUser(updated), token };
}

export async function resendOtp(input: ResendOtpInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    // Don't reveal whether an account exists.
    return { message: "If an account exists for this email, a new code has been sent" };
  }

  if (user.emailVerified) {
    throw new AppError("This account is already verified", 400, "ALREADY_VERIFIED");
  }

  const lastOtp = await prisma.emailOtp.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (lastOtp) {
    const secondsSinceLast = (Date.now() - lastOtp.createdAt.getTime()) / 1000;
    if (secondsSinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast);
      throw new AppError(`Please wait ${wait}s before requesting another code`, 429, "OTP_COOLDOWN");
    }
  }

  await issueAndSendOtp(user.id, user.email, user.name);
  return { message: "A new code has been sent to your email" };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const isValid = await comparePassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new AppError("Invalid email or password", 401);
  }

  if (!user.emailVerified) {
    throw new AppError(
      "Please verify your email before logging in",
      403,
      "EMAIL_NOT_VERIFIED"
    );
  }

  const token = signToken({ userId: user.id, email: user.email });

  return { user: toPublicUser(user), token };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404);
  }
  return toPublicUser(user);
}
