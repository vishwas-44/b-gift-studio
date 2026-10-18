import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Heart, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

type AuthResponse = {
  success: boolean;
  message?: string;
  user?: {
    id: string;
    email?: string;
  } | null;
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    expires_in?: number;
    token_type?: string;
  } | null;
};

export function AuthForm({ signup = false }: { signup?: boolean }) {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStage, setOtpStage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function postAuth(endpoint: string, body: Record<string, string>): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as AuthResponse;

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Something went wrong. Please try again.");
    }

    return result;
  }

  function saveSession(session: NonNullable<AuthResponse["session"]>) {
    localStorage.setItem("bhasi-auth-session", JSON.stringify(session));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (signup && !otpStage) {
        const result = await postAuth("/api/auth/signup/request-otp", {
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        });

        setOtpStage(true);
        setOtp("");
        setMessage(result.message || "A verification code has been sent to your email address.");
        return;
      }

      if (signup && otpStage) {
        const result = await postAuth("/api/auth/signup/verify-otp", {
          email: email.trim(),
          password,
          otp: otp.trim(),
        });

        if (result.session?.access_token) {
          saveSession(result.session);
          setPassword("");
          setOtp("");
          await navigate({ to: "/account" });
          return;
        }

        setMessage(result.message || "Your account was created. Please log in to continue.");
        setOtpStage(false);
        setPassword("");
        setOtp("");
        return;
      }

      const result = await postAuth("/api/auth/login", {
        email: email.trim(),
        password,
      });

      if (!result.session?.access_token) {
        throw new Error("Login succeeded without a session. Please try again.");
      }

      saveSession(result.session);
      setPassword("");

      try {
        const profileResponse = await fetch(`${API_BASE_URL}/api/account/profile`, {
          headers: {
            Authorization: `Bearer ${result.session.access_token}`,
          },
        });

        const profileResult = await profileResponse.json();

        if (!profileResponse.ok || !profileResult.success) {
          throw new Error(profileResult.message || "Unable to verify your account role.");
        }

        if (profileResult.profile?.role === "admin") {
          await navigate({ to: "/admin" });
        } else {
          await navigate({ to: "/account" });
        }
      } catch (error) {
        localStorage.removeItem("bhasi-auth-session");
        throw error;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await postAuth("/api/auth/signup/request-otp", {
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });

      setOtp("");
      setMessage(
        result.message || "If the address can be used for signup, a new code has been sent.",
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to resend the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <Heart className="mx-auto mb-5 text-primary" size={28} strokeWidth={1.4} />

      <h1>{signup ? (otpStage ? "Verify your email." : "A little more you.") : "Welcome back."}</h1>

      <p>
        {signup
          ? otpStage
            ? "Enter the six-digit code we sent you."
            : "Your favourite memories belong here."
          : "Your next lovely thing is waiting."}
      </p>

      <form onSubmit={submit} className="auth-form">
        {signup && !otpStage && (
          <label className="field">
            Your name
            <input
              type="text"
              name="fullName"
              autoComplete="name"
              placeholder="e.g. Ananya"
              maxLength={100}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </label>
        )}

        <label className="field">
          Email address
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={signup && otpStage}
            required
          />
        </label>

        {(!signup || !otpStage) && (
          <label className="field">
            Password
            <input
              type="password"
              name="password"
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? "At least 8 characters" : "Enter your password"}
              minLength={signup ? 8 : undefined}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        )}

        {!signup && (
          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-primary font-semibold">
              Forgot password?
            </Link>
          </div>
        )}

        {signup && otpStage && (
          <>
            <label className="field">
              Six-digit verification code
              <input
                type="text"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                autoFocus
              />
            </label>

            <p className="text-sm">
              <Mail size={16} className="inline mr-2" />
              Check your inbox and spam folder. The code expires in 10 minutes.
            </p>
          </>
        )}

        {error && (
          <div role="alert" className="auth-feedback">
            {error}
          </div>
        )}

        {message && (
          <div role="status" className="auth-feedback">
            {message}
          </div>
        )}

        <Button type="submit" size="lg" disabled={busy}>
          {busy
            ? "Please wait..."
            : signup
              ? otpStage
                ? "Verify email"
                : "Send verification code"
              : "Log in"}
          <ArrowRight />
        </Button>

        {signup && otpStage && (
          <div className="flex flex-col items-center gap-3 mt-4">
            <Button type="button" variant="outline" disabled={busy} onClick={resendOtp}>
              Resend code
            </Button>

            <button
              type="button"
              className="text-sm text-primary font-semibold"
              disabled={busy}
              onClick={() => {
                setOtpStage(false);
                setOtp("");
                setError("");
                setMessage("");
              }}
            >
              <ArrowLeft size={15} className="inline mr-1" />
              Back to signup
            </button>
          </div>
        )}
      </form>

      {!otpStage && (
        <p className="mt-6 text-center text-sm">
          {signup ? "Already part of the studio?" : "New to the studio?"}{" "}
          <Link to={signup ? "/login" : "/signup"} className="text-primary font-semibold">
            {signup ? "Log in" : "Join us"}
          </Link>
        </p>
      )}
    </div>
  );
}
