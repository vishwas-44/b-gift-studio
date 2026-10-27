import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/api/storefront";
import { authFetch, getAuthSession } from "@/lib/api/auth";

type Summary = {
  period: { label: string };
  orders: number;
  statuses: Record<string, number>;
  payments: Record<string, number>;
  order_value: number;
  collected_payments: number;
  unpaid_cod_value: number;
  trend: Array<{ date: string; orders: number; collected: number }>;
};
export const Route = createFileRoute("/admin_/reports")({
  head: () => pageHead("Reports", "Bhasi Gift Studio reports."),
  component: Reports,
});
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function Reports() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [range, setRange] = useState("30d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getAuthSession()
      .then((user) => {
        if (active) setAuthenticated(Boolean(user));
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : "Unable to verify your sign-in session.",
          );
          setAuthenticated(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function load() {
    if (authenticated !== true) return;
    setLoading(true);
    setError("");
    try {
      const r = await authFetch(`/api/admin/reports/summary?range=${range}`, {});
      const body = await r.json();
      if (!r.ok || !body.success) throw new Error(body.message || "Unable to load reports.");
      setSummary(body.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [authenticated, range]); // eslint-disable-line react-hooks/exhaustive-deps
  async function exportFinancial() {
    if (authenticated !== true) return;
    setError("");
    try {
      const r = await authFetch(`/api/admin/reports/financial-export?range=${range}`, {});
      if (!r.ok) throw new Error("Unable to export financial summary.");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "bhasi-financial-summary.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export financial summary.");
    }
  }
  const cards = summary
    ? [
        ["Orders created", summary.orders],
        ["Order value", money.format(summary.order_value)],
        ["Collected payments", money.format(summary.collected_payments)],
        ["Unpaid COD value", money.format(summary.unpaid_cod_value)],
        ["Paid orders", summary.payments.paid || 0],
        ["Unpaid orders", summary.payments.unpaid || 0],
        ["Pending", summary.statuses.pending || 0],
        ["Delivered", summary.statuses.delivered || 0],
      ]
    : [];
  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2">
        <LoaderCircle className="animate-spin" /> Checking session…
      </div>
    );
  }
  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border bg-white p-8 text-center">
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-4 md:px-8">
        <div>
          <Link to="/admin" className="text-sm text-rose-600">
            <ArrowLeft size={16} className="inline" /> Overview
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Reports</h1>
          <p className="text-sm text-stone-500">
            Orders created and confirmed payments for the selected period.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button onClick={() => void exportFinancial()} disabled={!summary}>
            <Download /> Export financial CSV
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
        <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
          <label className="text-sm font-medium">
            Reporting period{" "}
            <select
              className="ml-2 rounded-lg border p-2"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="month">This month</option>
              <option value="previous_month">Previous month</option>
            </select>
          </label>
          {summary && (
            <span className="self-center text-sm text-stone-500">
              Showing {summary.period.label}
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-800">
            {error}
          </p>
        )}
        {loading && !summary ? (
          <div className="flex justify-center p-12">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border bg-white p-4">
                  <p className="text-sm text-stone-500">{label}</p>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </section>
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-bold">Daily trend</h2>
              <p className="mt-1 text-sm text-stone-500">
                Collected payments only include orders marked paid by the backend.
              </p>
              {summary?.trend.length ? (
                <div className="mt-4 space-y-2">
                  {summary.trend.map((day) => (
                    <div
                      key={day.date}
                      className="flex justify-between gap-4 border-b py-2 text-sm"
                    >
                      <span>{day.date}</span>
                      <span>
                        {day.orders} orders · {money.format(day.collected)} collected
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-stone-500">
                  No orders were created in this period.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
