import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, Heart, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/api/storefront";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

type ApiResult = {
  success?: boolean;
  message?: string;
  resetToken?: string;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
};

export const Route = createFileRoute("/forgot-password")({
  head: () =>
    pageHead(
      "Reset your password",
      "Reset your Bhasi Gift Studio password using a secure email verification code.",
    ),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendAfter, setResendAfter] = useState(0);

  async function postJson(endpoint: string, payload: Record<string, string>): Promise<ApiResult> {
    const response = await fetch(`${API_BASE_URL}/api/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as ApiResult;

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Something went wrong. Please try again.");
    }

    return result;
  }

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await postJson("forgot-password", {
        email: email.trim(),
      });

      setStep(2);
      setOtp("");
      setMessage(
        result.message || "If an account exists for this email, a verification code has been sent.",
      );
      setResendAfter(result.resendAfterSeconds ?? 60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the six-digit code from your email.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await postJson("verify-reset-otp", {
        email: email.trim(),
        otp,
      });

      if (!result.resetToken) {
        throw new Error(
          "Verification succeeded, but no reset session was returned. Please request a new code.",
        );
      }

      setResetToken(result.resetToken);
      setStep(3);
      setMessage("Email verified. Choose your new password.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to verify the code.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8 || password.length > 128) {
      setError("Your password must be between 8 and 128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    if (!resetToken) {
      setError("Your verification session is missing. Please request a new code.");
      setStep(1);
      return;
    }

    setBusy(true);

    try {
      await postJson("reset-password", {
        email: email.trim(),
        resetToken,
        password,
      });

      setResetToken("");
      setPassword("");
      setConfirmPassword("");
      setMessage("Your password has been updated. You can now log in.");

      await navigate({ to: "/login" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to update your password.");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (resendAfter > 0 || busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await postJson("forgot-password", {
        email: email.trim(),
      });

      setOtp("");
      setMessage(
        result.message || "If an account exists for this email, a verification code has been sent.",
      );
      setResendAfter(result.resendAfterSeconds ?? 60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to resend the code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <Heart className="mx-auto mb-5 text-primary" size={28} strokeWidth={1.4} />

      <h1>
        {step === 1 && "Let's get you back."}
        {step === 2 && "Check your email."}
        {step === 3 && "Choose a new password."}
      </h1>

      <p>
        {step === 1 && "Enter your email and we'll help you reset your password."}
        {step === 2 && `Enter the six-digit verification code sent to ${email.trim()}.`}
        {step === 3 && "Create a new password for your Bhasi Gift Studio account."}
      </p>

      <div className="auth-form">
        <div className="mb-5 flex items-center justify-center gap-2 text-sm">
          <span className={step >= 1 ? "font-semibold text-primary" : ""}>1. Email</span>
          <span aria-hidden="true">—</span>
          <span className={step >= 2 ? "font-semibold text-primary" : ""}>2. Verify</span>
          <span aria-hidden="true">—</span>
          <span className={step >= 3 ? "font-semibold text-primary" : ""}>3. Password</span>
        </div>

        {step === 1 && (
          <form onSubmit={requestOtp} className="space-y-4">
            <label className="field">
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
              />
            </label>

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Sending code..." : "Send verification code"}
              <ArrowRight />
            </Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyOtp} className="space-y-4">
            <label className="field">
              Six-digit verification code
              <input
                type="text"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
            </label>

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              <ShieldCheck />
              {busy ? "Verifying..." : "Verify code"}
              <ArrowRight />
            </Button>

            <div className="text-center text-sm">
              <button
                type="button"
                className="font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                onClick={resendOtp}
                disabled={busy || resendAfter > 0}
              >
                {resendAfter > 0 ? `Resend code in ${resendAfter}s` : "Resend verification code"}
              </button>
            </div>

            <button
              type="button"
              className="w-full text-center text-sm"
              disabled={busy}
              onClick={() => {
                setStep(1);
                setOtp("");
                setError("");
                setMessage("");
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={saveNewPassword} className="space-y-4">
            <label className="field">
              New password
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
            </label>

            <label className="field">
              Confirm new password
              <input
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                placeholder="Enter the password again"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
            </label>

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Updating password..." : "Update password"}
              <CheckCircle2 />
            </Button>
          </form>
        )}

        {error && (
          <div role="alert" className="auth-feedback mt-4">
            {error}
          </div>
        )}

        {message && (
          <div role="status" className="auth-feedback mt-4">
            <Mail size={16} className="mr-2 inline" />
            {message}
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-semibold text-primary">
          <ArrowLeft size={15} className="mr-1 inline" />
          Back to login
        </Link>
      </p>
    </div>
  );
}
