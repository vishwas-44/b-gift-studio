import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
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

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  order_count: number;
};

type CustomerResponse = {
  success: boolean;
  message?: string;
  customers?: Customer[];
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

export const Route = createFileRoute("/admin_/customers")({
  head: () => pageHead("Customers", "Manage Bhasi Gift Studio customer records."),
  component: AdminCustomersPage,
});

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AdminCustomersPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

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

  async function loadCustomers(currentPage = page, currentSearch = search) {
    if (!session?.access_token) return;

    setLoading(true);
    setError("");
    setForbidden(false);

    const params = new URLSearchParams({
      page: String(currentPage),
      limit: "10",
    });

    if (currentSearch.trim()) {
      params.set("search", currentSearch.trim());
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/customers?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = (await response.json()) as CustomerResponse;

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
        throw new Error(result.message || "Unable to load customers.");
      }

      setCustomers(result.customers ?? []);
      setTotal(result.pagination?.total ?? 0);
      setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
      setPage(result.pagination?.page ?? currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) void loadCustomers(1, search);
    // loadCustomers is intentionally called when session or search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, search]);

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
            <span className="block text-[10px] uppercase tracking-[0.2em] text-stone-500">
              Admin Studio
            </span>
          </span>
        </Link>

        <div className="px-4 pt-6 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
          Workspace
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.label === "Customers";

            return (
              <Link
                key={item.label}
                to={item.to}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  active
                    ? "bg-rose-50 font-medium text-rose-600"
                    : "text-stone-600 hover:bg-stone-50"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <div className="flex items-center gap-3 px-1 py-2">
            <ShieldCheck className="text-stone-600" />
            <div>
              <p className="text-sm font-medium">Administrator</p>
              <p className="text-xs text-stone-500">Protected workspace</p>
            </div>
          </div>

          <Button variant="outline" className="mt-3 w-full" onClick={logout}>
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 md:ml-64">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-6 md:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-rose-500">
              Bhasi Gift Studio
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Customers</h1>
            <p className="mt-1 text-sm text-stone-500">
              Registered customer profiles from your database.
            </p>
          </div>

          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void loadCustomers(page, search)}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </header>

        <section className="p-5 md:p-8">
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-sm text-stone-500">Registered customers</p>
              <p className="mt-2 text-3xl font-semibold">{total}</p>
              <p className="mt-1 text-xs text-stone-500">Matching the current search</p>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <p className="text-sm text-stone-500">Customers on this page</p>
              <p className="mt-2 text-3xl font-semibold">{customers.length}</p>
              <p className="mt-1 text-xs text-stone-500">Maximum 10 customers per page</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap gap-3 border-b p-5">
              <form
                className="flex min-w-0 flex-1 flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setSearch(searchInput.trim());
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3">
                  <Search size={17} className="shrink-0 text-stone-400" />
                  <input
                    className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                    placeholder="Search customer name or phone"
                    value={searchInput}
                    maxLength={100}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </div>

                <Button type="submit">
                  <Search size={16} />
                  Search
                </Button>
              </form>
            </div>

            {error && (
              <div
                role="alert"
                className="m-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p>{error}</p>
                  {forbidden && <p className="mt-1">Sign in with an administrator account.</p>}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void loadCustomers(page, search)}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-5 py-4 font-medium">Customer</th>
                    <th className="px-5 py-4 font-medium">Phone</th>
                    <th className="px-5 py-4 font-medium">Registered</th>
                    <th className="px-5 py-4 text-right font-medium">Orders</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-stone-100">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-16 text-center">
                        <LoaderCircle className="mx-auto animate-spin text-rose-500" />
                        <p className="mt-3 text-stone-500">Loading customers…</p>
                      </td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-16 text-center">
                        <Users className="mx-auto text-stone-300" size={32} />
                        <p className="mt-3 font-medium">No customers found</p>
                        <p className="mt-1 text-stone-500">
                          Try another search or refresh the list.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    customers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-stone-50">
                        <td className="px-5 py-4">
                          <div className="font-medium">
                            {customer.full_name?.trim() || "Unnamed customer"}
                          </div>
                          <div className="mt-1 text-xs text-stone-400">{customer.id}</div>
                        </td>
                        <td className="px-5 py-4">{customer.phone || "Not provided"}</td>
                        <td className="px-5 py-4">{formatDate(customer.created_at)}</td>
                        <td className="px-5 py-4 text-right font-medium">{customer.order_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
              <p className="text-sm text-stone-500">
                {total === 0
                  ? "No matching customers"
                  : `Page ${page} of ${totalPages} · ${total} customers`}
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={loading || page <= 1}
                  onClick={() => void loadCustomers(page - 1, search)}
                >
                  <ChevronLeft size={16} />
                  Previous
                </Button>

                <Button
                  variant="outline"
                  disabled={loading || page >= totalPages}
                  onClick={() => void loadCustomers(page + 1, search)}
                >
                  Next
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
