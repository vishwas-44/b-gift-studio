import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Gift,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/api/storefront";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: number | string;
  created_at: string;
  shipping_address?: Record<string, unknown> | null;
};

type OrdersResponse = {
  success: boolean;
  message?: string;
  orders?: Order[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type AdminSession = {
  access_token: string;
};

type TractionDay = { date: string; visitors: number; orders: number };
type TractionSummary = {
  days: number;
  page_views: number;
  visitors: number;
  product_views: number;
  add_to_cart: number;
  checkout_starts: number;
  orders: number;
  paid_orders: number;
  order_value: number;
  paid_value: number;
  trend: TractionDay[];
};

export const Route = createFileRoute("/admin")({
  head: () => pageHead("Admin Dashboard", "Bhasi Gift Studio order and store administration."),
  component: AdminDashboard,
});

function formatMoney(value: number | string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusClass(status: string) {
  const value = status.toLowerCase();

  if (["delivered", "paid", "completed"].includes(value)) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (["cancelled", "failed", "refunded"].includes(value)) {
    return "bg-red-100 text-red-800";
  }

  if (["processing", "shipped"].includes(value)) {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-amber-100 text-amber-800";
}

function AdminDashboard() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [traction, setTraction] = useState<TractionSummary | null>(null);
  const [tractionDays, setTractionDays] = useState(30);
  const [tractionLoading, setTractionLoading] = useState(false);
  const [tractionError, setTractionError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bhasi-auth-session");

      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AdminSession>;

        if (typeof parsed.access_token === "string" && parsed.access_token.length > 0) {
          setSession({ access_token: parsed.access_token });
        }
      }
    } catch {
      setError("Your saved login session could not be read. Please log in again.");
    } finally {
      setSessionChecked(true);
    }
  }, []);

  async function loadOrders(currentPage = page) {
    if (!session?.access_token) return;

    setLoading(true);
    setError("");
    setForbidden(false);

    const params = new URLSearchParams({
      page: String(currentPage),
      limit: "10",
    });

    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (paymentStatus) params.set("payment_status", paymentStatus);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/orders?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = (await response.json()) as OrdersResponse;

      if (response.status === 401) {
        setError("Your session has expired. Please log in again.");
        return;
      }

      if (response.status === 403) {
        setForbidden(true);
        setError("This account does not have administrator access.");
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load orders.");
      }

      setOrders(result.orders ?? []);
      setTotal(result.pagination?.total ?? 0);
      setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
      setPage(result.pagination?.page ?? currentPage);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the backend. Check that the API is running.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadTraction(days = tractionDays) {
    if (!session?.access_token) return;
    setTractionLoading(true);
    setTractionError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/summary?days=${days}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.message || "Unable to load traction metrics.");
      setTraction(result.summary as TractionSummary);
    } catch (reason) {
      setTractionError(
        reason instanceof Error ? reason.message : "Unable to load traction metrics.",
      );
    } finally {
      setTractionLoading(false);
    }
  }

  useEffect(() => {
    if (session) void loadOrders(1);
    // Reload when filters or the authenticated session change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, search, status, paymentStatus]);

  useEffect(() => {
    if (session) void loadTraction(tractionDays);
    // Refresh the metrics when the administrator changes the reporting window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tractionDays]);

  function logout() {
    localStorage.removeItem("bhasi-auth-session");
    window.location.assign("/login");
  }

  const navigation = [
    { label: "Overview", icon: LayoutDashboard, to: "/admin" as const },
    { label: "Orders", icon: ClipboardList, to: "/admin/orders" as const },
    { label: "Products", icon: Package, to: "/admin/products" as const },
    { label: "Customers", icon: Users, to: "/admin/customers" as const },
    { label: "Feedback", icon: MessageSquareText, to: "/admin/feedback" as const },
  ];

  const maxVisitors = Math.max(1, ...(traction?.trend.slice(-14).map((day) => day.visitors) ?? []));
  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="animate-spin" />
        <span className="ml-2">Checking session…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-4 text-rose-500" size={40} />
          <h1 className="text-2xl font-bold">Admin sign-in required</h1>
          <p className="mt-2 text-sm text-stone-600">
            Sign in with your Bhasi Gift Studio account to continue.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/login">Go to login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-stone-200 bg-white md:flex">
        <Link to="/" className="flex items-center gap-3 border-b p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
            <Gift size={22} />
          </span>
          <span>
            <span className="block text-lg font-bold">
              bhasi<span className="text-rose-500">.</span>
            </span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-stone-500">
              ADMIN STUDIO
            </span>
          </span>
        </Link>

        <div className="px-4 pt-6 text-xs font-semibold uppercase tracking-wider text-stone-400">
          Workspace
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.label === "Overview";

            return (
              <Link
                key={item.label}
                to={item.to}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                  active
                    ? "bg-rose-50 font-semibold text-rose-600"
                    : "text-stone-500 hover:bg-stone-50 hover:text-rose-600"
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">Administrator</p>
              <p className="text-xs text-stone-500">Protected workspace</p>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={logout}>
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="flex items-center justify-between border-b bg-white px-5 py-4 md:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-rose-500">
              Bhasi Gift Studio
            </p>
            <h1 className="mt-1 text-xl font-bold md:text-2xl">Store overview</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadOrders(page)}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </header>

        <main className="space-y-6 p-4 md:p-8">
          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5 md:p-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
                  Store momentum
                </span>
                <h2 className="mt-1 text-xl font-bold">Website traction</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Real anonymous storefront activity and order records for this period.
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  aria-label="Traction date range"
                  value={tractionDays}
                  onChange={(event) => setTractionDays(Number(event.target.value))}
                  className="rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={tractionLoading}
                  onClick={() => void loadTraction()}
                >
                  <RefreshCw size={15} className={tractionLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
            </div>
            {tractionError ? (
              <div
                role="alert"
                className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              >
                {tractionError}
              </div>
            ) : traction ? (
              <div className="space-y-5 p-5 md:p-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Unique visitors", traction.visitors.toLocaleString("en-IN")],
                    ["Page views", traction.page_views.toLocaleString("en-IN")],
                    ["Product views", traction.product_views.toLocaleString("en-IN")],
                    ["Added to cart", traction.add_to_cart.toLocaleString("en-IN")],
                    ["Checkout starts", traction.checkout_starts.toLocaleString("en-IN")],
                    ["Orders created", traction.orders.toLocaleString("en-IN")],
                    ["Paid orders", traction.paid_orders.toLocaleString("en-IN")],
                    ["Collected payments", currency.format(Number(traction.paid_value))],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border bg-stone-50 p-4">
                      <p className="text-xs text-stone-500">{label}</p>
                      <p className="mt-2 text-2xl font-bold">{tractionLoading ? "…" : value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
                  <div className="rounded-xl border p-4">
                    <h3 className="font-semibold">Unique visitors · daily</h3>
                    {traction.trend.length ? (
                      <div className="mt-4 grid h-32 grid-cols-7 items-end gap-2 sm:grid-cols-14">
                        {traction.trend.slice(-14).map((day) => (
                          <div
                            key={day.date}
                            className="flex h-full flex-col items-center justify-end gap-1"
                            title={`${day.date}: ${day.visitors} visitors, ${day.orders} orders`}
                          >
                            <div
                              className="w-full rounded-t bg-rose-500"
                              style={{
                                height: `${Math.max(day.visitors ? 8 : 2, (day.visitors / maxVisitors) * 100)}%`,
                              }}
                            />
                            <span className="text-[9px] text-stone-500">
                              {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-stone-500">No activity recorded yet.</p>
                    )}
                  </div>
                  <div className="rounded-xl border bg-rose-50/60 p-4">
                    <h3 className="font-semibold">Order value</h3>
                    <p className="mt-2 text-2xl font-bold">
                      {currency.format(Number(traction.order_value))}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-stone-600">
                      Includes unpaid orders; it is not collected revenue. Collected payments above
                      only include orders marked paid by the backend.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-stone-500">
                  Visitor tracking uses an anonymous browser ID. No names, email addresses, IP
                  addresses, search text or design content are stored. Activity begins after the
                  analytics migration is applied.
                </p>
              </div>
            ) : (
              <div className="p-6 text-sm text-stone-500">
                {tractionLoading ? "Loading traction data…" : "No traction data loaded."}
              </div>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center justify-between text-sm text-stone-500">
                Total orders matching filters
                <ClipboardList size={18} className="text-rose-500" />
              </div>
              <p className="mt-4 text-3xl font-bold">{loading && total === 0 ? "…" : total}</p>
              <p className="mt-2 text-xs text-stone-500">Based on the current API filters</p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center justify-between text-sm text-stone-500">
                Orders on this page
                <ArrowUpRight size={18} className="text-emerald-600" />
              </div>
              <p className="mt-4 text-3xl font-bold">{orders.length}</p>
              <p className="mt-2 text-xs text-stone-500">Maximum 10 orders per page</p>
            </div>
            <div className="rounded-2xl border bg-white p-5 sm:col-span-2 xl:col-span-1">
              <div className="flex items-center justify-between text-sm text-stone-500">
                Page position
                <ArrowDownRight size={18} className="text-rose-500" />
              </div>
              <p className="mt-4 text-3xl font-bold">
                {page} <span className="text-lg text-stone-400">/ {totalPages}</span>
              </p>
              <p className="mt-2 text-xs text-stone-500">Use pagination to view more orders</p>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="border-b p-5 md:p-6">
              <h2 className="text-lg font-bold">Recent orders</h2>
              <p className="mt-1 text-sm text-stone-500">
                Orders loaded from the protected admin API.
              </p>

              <form
                className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setSearch(searchInput.trim());
                }}
              >
                <label className="relative block">
                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    className="w-full rounded-lg border border-stone-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-rose-400"
                    placeholder="Search order number"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </label>

                <select
                  aria-label="Filter by order status"
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm"
                  value={status}
                  onChange={(event) => {
                    setPage(1);
                    setStatus(event.target.value);
                  }}
                >
                  <option value="">All order statuses</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  aria-label="Filter by payment status"
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm"
                  value={paymentStatus}
                  onChange={(event) => {
                    setPage(1);
                    setPaymentStatus(event.target.value);
                  }}
                >
                  <option value="">All payment statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>

                <Button type="submit">
                  <Search size={16} />
                  Search
                </Button>
              </form>
            </div>

            {error && (
              <div
                role="alert"
                className="m-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
              >
                <AlertCircle size={19} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    {forbidden ? "Administrator access denied" : "Unable to load orders"}
                  </p>
                  <p className="mt-1">{error}</p>
                  {forbidden && (
                    <p className="mt-2">
                      Ask the project owner to verify your profile role in Supabase.
                    </p>
                  )}
                  {!forbidden && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void loadOrders(page)}
                    >
                      Try again
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Order</th>
                    <th className="px-5 py-4 font-semibold">Date</th>
                    <th className="px-5 py-4 font-semibold">Order status</th>
                    <th className="px-5 py-4 font-semibold">Payment</th>
                    <th className="px-5 py-4 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {loading && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-stone-500">
                        <LoaderCircle className="mx-auto mb-2 animate-spin" />
                        Loading orders…
                      </td>
                    </tr>
                  )}

                  {!loading && !error && orders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <Package className="mx-auto mb-3 text-stone-300" size={30} />
                        <p className="font-semibold">No orders found</p>
                        <p className="mt-1 text-sm text-stone-500">
                          Try another filter or check again when orders are available.
                        </p>
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    orders.map((order) => (
                      <tr key={order.id} className="hover:bg-rose-50/30">
                        <td className="px-5 py-4 font-semibold">{order.order_number}</td>
                        <td className="px-5 py-4 text-stone-600">{formatDate(order.created_at)}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.status)}`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.payment_status)}`}
                          >
                            {order.payment_status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-semibold">
                          {formatMoney(order.total_amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
              <p className="text-sm text-stone-500">
                {total === 0
                  ? "No matching orders"
                  : `Showing ${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} of ${total}`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || page <= 1}
                  onClick={() => void loadOrders(page - 1)}
                >
                  <ChevronLeft size={16} />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || page >= totalPages}
                  onClick={() => void loadOrders(page + 1)}
                >
                  Next
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </section>

          <p className="text-xs text-stone-500">
            Order and payment statuses are displayed as returned by the backend. This page does not
            process payments or update order statuses.
          </p>
        </main>
      </div>
    </div>
  );
}
