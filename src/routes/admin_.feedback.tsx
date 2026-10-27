import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/api/storefront";
import { authFetch, getAuthSession, signOut as endSession } from "@/lib/api/auth";

const PAGE_SIZE = 20;

type Feedback = {
  id: string;
  user_id: string;
  category: string;
  rating: number;
  message: string;
  status: "new" | "reviewed" | "resolved";
  created_at: string;
  customer: { full_name: string | null; phone: string | null } | null;
};

type FeedbackResponse = {
  success: boolean;
  message?: string;
  feedback?: Feedback[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
};

export const Route = createFileRoute("/admin_/feedback")({
  head: () => pageHead("Customer Feedback", "Review and manage customer feedback."),
  component: AdminFeedbackPage,
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(status: Feedback["status"]) {
  if (status === "resolved") return "bg-emerald-100 text-emerald-800";
  if (status === "reviewed") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
}

function AdminFeedbackPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [rows, setRows] = useState<Feedback[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let active = true;
    void getAuthSession()
      .then((user) => {
        if (active) setAuthenticated(Boolean(user));
        if (active) setSessionChecked(true);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : "Unable to verify your sign-in session.",
          );
          setSessionChecked(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadFeedback(nextPage = page) {
    if (!authenticated) return;
    setLoading(true);
    setError("");
    setForbidden(false);
    const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    try {
      const response = await authFetch(`/api/admin/feedback?${params}`, {});
      const result = (await response.json()) as FeedbackResponse;
      if (response.status === 401) throw new Error("Your session expired. Please sign in again.");
      if (response.status === 403) {
        setForbidden(true);
        throw new Error("This account does not have administrator access.");
      }
      if (!response.ok || !result.success)
        throw new Error(result.message || "Unable to load feedback.");
      setRows(result.feedback || []);
      setTotal(result.pagination?.total || 0);
      setTotalPages(Math.max(1, result.pagination?.totalPages || 1));
      setPage(result.pagination?.page || nextPage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load customer feedback.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authenticated) void loadFeedback(1);
    // Refresh the list when the administrator session or status filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, status]);

  async function updateStatus(item: Feedback, nextStatus: Feedback["status"]) {
    setSavingId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`/api/admin/feedback/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = (await response.json()) as { success: boolean; message?: string };
      if (!response.ok || !result.success)
        throw new Error(result.message || "Unable to update feedback.");
      setRows((current) =>
        current.map((row) => (row.id === item.id ? { ...row, status: nextStatus } : row)),
      );
      setNotice("Feedback status updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update feedback.");
    } finally {
      setSavingId("");
    }
  }

  async function signOutPage() {
    await endSession();
    window.location.assign("/login");
  }

  if (!sessionChecked || (authenticated && loading && rows.length === 0 && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2">
        <LoaderCircle className="animate-spin" /> Loading feedback…
      </div>
    );
  }
  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
        <section className="w-full max-w-md rounded-2xl border bg-white p-8 text-center">
          <ShieldCheck className="mx-auto mb-4 text-rose-500" size={40} />
          <h1 className="text-2xl font-bold">Admin sign-in required</h1>
          <Button asChild className="mt-6 w-full">
            <Link to="/login">Go to login</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-5 py-4 md:px-8">
        <div>
          <Link
            to="/admin"
            className="mb-2 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-rose-600"
          >
            <ArrowLeft size={16} /> Back to overview
          </Link>
          <h1 className="text-2xl font-bold">Customer feedback</h1>
          <p className="mt-1 text-sm text-stone-500">
            Review customer messages and update their status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading} onClick={() => void loadFeedback(page)}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button variant="outline" onClick={signOutPage}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
        {error && (
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <AlertCircle size={18} />{" "}
            <div>
              <strong>{forbidden ? "Administrator access denied" : "Request failed"}</strong>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {notice}
          </p>
        )}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <MessageSquareText className="text-rose-600" />
            <div>
              <p className="text-sm text-stone-500">Feedback submissions</p>
              <p className="text-2xl font-bold">{total}</p>
            </div>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Filter status
            <select
              className="rounded-lg border border-stone-200 bg-white px-3 py-2"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">All feedback</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </section>
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-stone-600">
            <LoaderCircle className="animate-spin" size={16} /> Updating list…
          </p>
        ) : rows.length === 0 ? (
          <section className="rounded-xl border bg-white p-12 text-center">
            <MessageSquareText className="mx-auto text-stone-400" size={36} />
            <h2 className="mt-3 font-semibold">No feedback found</h2>
            <p className="mt-1 text-sm text-stone-500">
              Customer feedback will appear here after it is submitted.
            </p>
          </section>
        ) : (
          <section className="space-y-4">
            {rows.map((item) => (
              <article key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{item.customer?.full_name || "Customer"}</h2>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      {item.customer?.phone || "No phone on profile"} ·{" "}
                      {formatDate(item.created_at)}
                    </p>
                    <p className="mt-3 text-sm font-medium capitalize">
                      {item.category.replaceAll("_", " ")} · {item.rating}/5
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
                      {item.message}
                    </p>
                  </div>
                  <label className="grid shrink-0 gap-1 text-xs font-medium text-stone-600">
                    Update status
                    <select
                      aria-label={`Update feedback status from ${item.customer?.full_name || "customer"}`}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                      value={item.status}
                      disabled={savingId === item.id}
                      onChange={(event) =>
                        void updateStatus(item, event.target.value as Feedback["status"])
                      }
                    >
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
            <div className="flex items-center justify-between rounded-xl border bg-white p-4 text-sm">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => void loadFeedback(page - 1)}
                >
                  <ChevronLeft size={16} /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => void loadFeedback(page + 1)}
                >
                  Next <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
