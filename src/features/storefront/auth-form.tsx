import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setSubmitted(false);
    window.setTimeout(() => {
      setBusy(false);
      setSubmitted(true);
    }, 350);
  }
  return (
    <div className="auth-wrap">
      <Heart className="mx-auto mb-5 text-primary" size={28} strokeWidth={1.4} />
      <h1>{signup ? "A little more you." : "Welcome back."}</h1>
      <p>
        {signup ? "Your favourite memories belong here." : "Your next lovely thing is waiting."}
      </p>
      <div className="demo-notice mt-6">
        <strong>Frontend preview only</strong>
        <br />
        Login and sign-up are not connected. Please use sample details, not a real password. No
        account will be created.
      </div>
      <form onSubmit={submit} className="auth-form">
        {signup && (
          <label className="field">
            Your name
            <input required autoComplete="off" placeholder="e.g. Ananya" maxLength={100} />
          </label>
        )}
        <label className="field">
          Email address
          <input type="email" required autoComplete="off" placeholder="you@example.com" />
        </label>
        <label className="field">
          Demo password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </label>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Checking form…" : signup ? "Preview sign up" : "Preview login"}
          <ArrowRight />
        </Button>
        {submitted && (
          <div role="status" className="auth-feedback">
            Your form is valid. {signup ? "Account creation" : "Sign-in"} is pending the
            authentication integration. You have not been signed in; no details were sent or saved.
          </div>
        )}
      </form>
      <p className="mt-6 text-center text-sm">
        {signup ? "Already part of the studio?" : "New to the studio?"}{" "}
        <Link to={signup ? "/login" : "/signup"} className="text-primary font-semibold">
          {signup ? "Log in" : "Join us"}
        </Link>
      </p>
    </div>
  );
}
