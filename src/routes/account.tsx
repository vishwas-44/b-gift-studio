import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  PackageOpen,
  UserRound,
  Palette,
  LogOut,
  MessageSquareText,
  Save,
  RefreshCw,
  Pencil,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/api/storefront";
import { authFetch, getAuthSession, signOut } from "@/lib/api/auth";

type Session = true;

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string;
  created_at?: string;
  updated_at?: string;
};

type SavedDesign = {
  id: string;
  product_id: string | null;
  design_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type Feedback = {
  id: string;
  category: string;
  rating: number;
  message: string;
  status: "new" | "reviewed" | "resolved";
  created_at: string;
};

type ApiResult = {
  success?: boolean;
  message?: string;
};

export const Route = createFileRoute("/account")({
  head: () => pageHead("Your studio", "Manage your Bhasi Gift Studio profile and saved designs."),
  component: Account,
});

async function apiRequest<T extends ApiResult>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await authFetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Cannot connect to the backend. Make sure the backend server is running on port 5000.",
    );
  }
  const responseText = await response.text();
  let result: T;
  try {
    result = JSON.parse(responseText) as T;
  } catch {
    throw new Error(`The backend returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok || !result.success) {
    throw new Error(result.message || `Request failed (HTTP ${response.status}).`);
  }
  return result;
}

function Account() {
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingDesigns, setRefreshingDesigns] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function initialise() {
      try {
        const user = await getAuthSession();
        if (!user) {
          if (active) setError("Please log in to view your personal account.");
          return;
        }
        if (active) {
          setSession(true);
          setError("");
        }
        const [profileResult, designsResult] = await Promise.all([
          apiRequest<{ success: boolean; profile: Profile }>("/api/account/profile"),
          apiRequest<{ success: boolean; designs: SavedDesign[] }>("/api/account/designs"),
        ]);
        if (!active) return;
        setProfile(profileResult.profile);
        setFullName(profileResult.profile.full_name || "");
        setPhone(profileResult.profile.phone || "");
        setDesigns(designsResult.designs || []);
        void loadFeedback();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load your account.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialise();
    return () => {
      active = false;
    };
  }, []);

  async function loadFeedback() {
    try {
      const result = await apiRequest<{ success: boolean; feedback: Feedback[] }>(
        "/api/account/feedback",
      );
      setFeedback(result.feedback || []);
      setFeedbackError("");
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Unable to load your feedback.");
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setFeedbackSaving(true);
    setFeedbackError("");
    setFeedbackSuccess("");
    try {
      const result = await apiRequest<{ success: boolean; feedback: Feedback }>(
        "/api/account/feedback",
        {
          method: "POST",
          body: JSON.stringify({
            category: feedbackCategory,
            rating: feedbackRating,
            message: feedbackMessage.trim(),
          }),
        },
      );
      setFeedback((rows) => [result.feedback, ...rows].slice(0, 20));
      setFeedbackMessage("");
      setFeedbackSuccess("Thank you. Your feedback has been sent to our team.");
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Unable to submit feedback.");
    } finally {
      setFeedbackSaving(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      setError("Please log in again to update your profile.");
      return;
    }

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await apiRequest<{
        success: boolean;
        message: string;
        profile: Profile;
      }>("/api/account/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: trimmedName,
          phone: trimmedPhone,
        }),
      });

      setProfile(result.profile);
      setFullName(result.profile.full_name || "");
      setPhone(result.profile.phone || "");

      setMessage(result.message || "Profile updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save your profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function refreshDesigns() {
    if (!session) {
      setError("Please log in again to view your saved designs.");
      return;
    }

    setRefreshingDesigns(true);
    setError("");
    setMessage("");

    try {
      const result = await apiRequest<{
        success: boolean;
        designs: SavedDesign[];
      }>("/api/account/designs");

      setDesigns(result.designs || []);
      setMessage("Saved designs refreshed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh saved designs.");
    } finally {
      setRefreshingDesigns(false);
    }
  }

  async function logout() {
    await signOut();
    setSession(null);
    setProfile(null);
    setDesigns([]);
    setFeedback([]);
    setError("");
    setMessage("");
    void navigate({ to: "/login" });
  }

  return (
    <>
      <section className="page-heading">
        <div className="container">
          <span className="eyebrow text-primary">A space for your stories</span>
          <h1>Your studio.</h1>
          <p>Your people. Your gifts. Your favourite little moments.</p>
        </div>
      </section>

      <div className="container account-layout account-dashboard">
        <nav className="account-nav" aria-label="Account navigation">
          <strong>My account</strong>
          <a className="account-nav-active" href="#profile">
            <UserRound size={16} /> My profile
          </a>
          <a href="#saved-designs">
            <Palette size={16} /> Saved designs
          </a>
          <a href="#feedback">
            <MessageSquareText size={16} /> Feedback
          </a>
          <Link to="/orders">
            <PackageOpen size={16} /> My orders
          </Link>
          {session && (
            <button type="button" onClick={logout}>
              <LogOut size={16} /> Log out
            </button>
          )}
        </nav>
        <main className="account-main">
          {loading ? (
            <div className="account-section">
              <p>Loading your account...</p>
            </div>
          ) : !session || !profile ? (
            <div className="account-section">
              <div className="flex items-center gap-3">
                <UserRound className="text-primary" />
                <h2>Your personal studio</h2>
              </div>

              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                {error || "Log in to view your profile and saved designs."}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/login">Log in</Link>
                </Button>

                <Button asChild variant="outline">
                  <Link to="/signup">Create account</Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="account-section" id="profile">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <UserRound className="text-primary" />
                    <h2>My profile</h2>
                  </div>

                  <Button type="button" variant="outline" onClick={logout}>
                    <LogOut />
                    Log out
                  </Button>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">Manage your personal details.</p>

                <form onSubmit={saveProfile} className="auth-form mt-5">
                  <label className="field">
                    Full name
                    <input
                      type="text"
                      autoComplete="name"
                      maxLength={100}
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                    />
                  </label>

                  <label className="field">
                    Email address
                    <input
                      type="email"
                      value={profile.email}
                      readOnly
                      aria-describedby="email-note"
                    />
                    <span id="email-note" className="text-xs text-muted-foreground">
                      Your verified sign-in email.
                    </span>
                  </label>

                  <label className="field">
                    Phone number
                    <input
                      type="tel"
                      autoComplete="tel"
                      maxLength={30}
                      placeholder="Enter your phone number"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                    />
                  </label>

                  <Button type="submit" disabled={saving}>
                    <Save />
                    {saving ? "Saving..." : "Save profile"}
                  </Button>
                </form>
              </div>

              <div className="account-section" id="saved-designs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Palette className="text-primary" />
                    <h2>My saved designs</h2>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshDesigns}
                    disabled={refreshingDesigns}
                  >
                    <RefreshCw />
                    {refreshingDesigns ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>

                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Designs saved to your account appear here.
                </p>

                {designs.length === 0 ? (
                  <div className="empty-state mt-5">
                    <Palette size={38} strokeWidth={1.2} />
                    <h2>No account designs yet</h2>
                    <p>
                      Designs saved only in this browser are not automatically uploaded to your
                      account.
                    </p>

                    <Button asChild variant="outline">
                      <Link to="/designs">
                        Open designs
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {designs.map((design) => (
                      <div key={design.id} className="rounded-lg border p-4">
                        <h3 className="font-semibold">{design.design_name || "Untitled design"}</h3>

                        <p className="mt-2 text-sm text-muted-foreground">
                          Status: {design.status}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          Updated: {new Date(design.updated_at).toLocaleDateString()}
                        </p>
                        {design.status === "draft" && (
                          <Button asChild variant="outline" size="sm" className="mt-4">
                            <Link to="/customize" search={{ designId: design.id }}>
                              <Pencil />
                              Edit / reuse
                            </Link>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="account-section">
                <div className="flex items-center gap-3">
                  <PackageOpen className="text-primary" />
                  <h2>My orders</h2>
                </div>

                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  Review orders created from your account, including their current unpaid payment
                  status.
                </p>

                <Button asChild variant="outline" className="mt-4">
                  <Link to="/orders">
                    View my orders
                    <ArrowRight />
                  </Link>
                </Button>
              </div>

              <div className="account-section" id="feedback">
                <div className="flex items-center gap-3">
                  <MessageSquareText className="text-primary" />
                  <h2>Share feedback</h2>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Tell us about your experience. Our team will review your message.
                </p>
                <form onSubmit={(event) => void submitFeedback(event)} className="auth-form mt-5">
                  <label className="field">
                    What is your feedback about?
                    <select
                      value={feedbackCategory}
                      onChange={(event) => setFeedbackCategory(event.target.value)}
                    >
                      <option value="general">General experience</option>
                      <option value="product">Product or personalization</option>
                      <option value="delivery">Delivery or order</option>
                      <option value="website">Website</option>
                      <option value="support">Customer support</option>
                    </select>
                  </label>
                  <label className="field">
                    How was your experience?
                    <select
                      value={feedbackRating}
                      onChange={(event) => setFeedbackRating(Number(event.target.value))}
                    >
                      <option value={5}>5 — Excellent</option>
                      <option value={4}>4 — Good</option>
                      <option value={3}>3 — Okay</option>
                      <option value={2}>2 — Poor</option>
                      <option value={1}>1 — Very poor</option>
                    </select>
                  </label>
                  <label className="field">
                    Your message
                    <textarea
                      value={feedbackMessage}
                      onChange={(event) => setFeedbackMessage(event.target.value)}
                      minLength={10}
                      maxLength={2000}
                      rows={5}
                      placeholder="Share what went well or what we can improve."
                      required
                    />
                    <span className="text-xs text-muted-foreground">
                      {feedbackMessage.length}/2,000 characters
                    </span>
                  </label>
                  {feedbackError && (
                    <p role="alert" className="text-sm text-destructive">
                      {feedbackError}
                    </p>
                  )}
                  {feedbackSuccess && (
                    <p role="status" className="text-sm text-emerald-700">
                      {feedbackSuccess}
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={feedbackSaving || feedbackMessage.trim().length < 10}
                  >
                    {feedbackSaving ? "Sending feedback…" : "Send feedback"}
                  </Button>
                </form>
                {feedback.length > 0 && (
                  <div className="mt-8 space-y-3">
                    <h3 className="font-semibold">Your previous feedback</h3>
                    {feedback.map((item) => (
                      <article key={item.id} className="rounded-lg border p-4">
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <strong>
                            {item.category.replaceAll("_", " ")} · {item.rating}/5
                          </strong>
                          <span className="capitalize text-muted-foreground">{item.status}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm">{item.message}</p>
                        <time
                          className="mt-2 block text-xs text-muted-foreground"
                          dateTime={item.created_at}
                        >
                          {new Date(item.created_at).toLocaleDateString()}
                        </time>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {error && session && (
            <div role="alert" aria-live="assertive" className="account-section">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {message && (
            <div role="status" aria-live="polite" className="account-section">
              <p className="text-sm">{message}</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
