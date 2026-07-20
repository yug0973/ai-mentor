import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";

export default function Signup() {
  const { register, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<"form" | "otp">("form");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [code, setCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register(name, email, password, phoneNumber || undefined);
      setStep("otp");
      startCooldown();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyOtp(email, code);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startCooldown() {
    setResendCooldown(60);
    const timer = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function handleResend() {
    setError(null);
    setResendMessage(null);
    try {
      const res = await resendOtp(email);
      setResendMessage(res.message);
      startCooldown();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  if (step === "otp") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-lg border border-mist bg-panel p-8">
          <p className="font-mono-label text-xs uppercase tracking-widest text-blaze">
            Almost there
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-parchment">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-fog">
            We sent a 6-digit code to <span className="text-parchment">{email}</span>.
          </p>

          <form onSubmit={handleOtpSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="code"
                className="font-mono-label text-xs uppercase tracking-wider text-fog"
              >
                Verification code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-center text-lg tracking-[0.5em] text-parchment outline-none focus:border-blaze"
                placeholder="000000"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-blaze">
                {error}
              </p>
            )}
            {resendMessage && !error && (
              <p className="text-sm text-moss">{resendMessage}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || code.length !== 6}
              className="w-full rounded-full bg-blaze px-6 py-2.5 text-sm font-medium text-bg transition hover:bg-blaze-dim disabled:opacity-60"
            >
              {isSubmitting ? "Verifying…" : "Verify and continue"}
            </button>
          </form>

          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="mt-4 text-sm text-moss hover:text-parchment disabled:opacity-50"
          >
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
          </button>

          <button
            onClick={() => setStep("form")}
            className="mt-6 block text-sm text-fog hover:text-parchment"
          >
            ← Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-mist bg-panel p-8">
        <p className="font-mono-label text-xs uppercase tracking-widest text-blaze">
          Trailhead
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-parchment">
          Start your route
        </h1>

        <form onSubmit={handleFormSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="font-mono-label text-xs uppercase tracking-wider text-fog">
              Name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
            />
          </div>

          <div>
            <label htmlFor="email" className="font-mono-label text-xs uppercase tracking-wider text-fog">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
            />
          </div>

          <div>
            <label htmlFor="phoneNumber" className="font-mono-label text-xs uppercase tracking-wider text-fog">
              Phone number <span className="normal-case text-fog/70">(optional)</span>
            </label>
            <input
              id="phoneNumber"
              type="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="mt-1 w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
            />
            <p className="mt-1 text-xs text-fog">
              Stored on your account — not verified via SMS yet.
            </p>
          </div>

          <div>
            <label htmlFor="password" className="font-mono-label text-xs uppercase tracking-wider text-fog">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
            />
            <p className="mt-1 text-xs text-fog">At least 8 characters.</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-blaze">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-blaze px-6 py-2.5 text-sm font-medium text-bg transition hover:bg-blaze-dim disabled:opacity-60"
          >
            {isSubmitting ? "Setting off…" : "Continue"}
          </button>
        </form>

        <p className="mt-4 text-sm text-fog">
          Already have an account?{" "}
          <Link to="/login" className="text-moss hover:text-parchment">
            Log back in
          </Link>
        </p>

        <Link
          to="/"
          className="mt-6 inline-block text-sm text-moss hover:text-parchment"
        >
          ← Back to the trailhead
        </Link>
      </div>
    </div>
  );
}