import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  LoaderCircle,
  MessageSquareText,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/api/storefront";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

type AdminSession = {
  access_token: string;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | string;
  currency: string;
  image_url: string | null;
  stock_quantity: number;
  is_active: boolean;
};

type ProductsResponse = {
  success: boolean;
  message?: string;
  count?: number;
  products?: Product[];
  product?: Product;
};

export const Route = createFileRoute("/admin_/products")({
  head: () =>
    pageHead("Manage Products", "Manage Bhasi Gift Studio product prices, stock and availability."),
  component: AdminProductsPage,
});

function money(value: number | string, currency = "INR") {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function AdminProductsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { price: string; stock: string }>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bhasi-auth-session");

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AdminSession>;

        if (typeof parsed.access_token === "string" && parsed.access_token.length > 0) {
          setSession({ access_token: parsed.access_token });
        }
      }
    } catch {
      setError("Your saved session could not be read. Please sign in again.");
    } finally {
      setSessionChecked(true);
    }
  }, []);

  const apiRequest = useCallback(
    async (path: string, options: RequestInit = {}) => {
      if (!session?.access_token) {
        throw new Error("Please sign in to continue.");
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      });

      const result = (await response.json()) as ProductsResponse;

      if (response.status === 401) {
        localStorage.removeItem("bhasi-auth-session");
        throw new Error("Your session has expired. Please sign in again.");
      }

      if (response.status === 403) {
        setForbidden(true);
        throw new Error("This account does not have administrator access.");
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "The request failed.");
      }

      return result;
    },
    [session],
  );

  const loadProducts = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setError("");
    setSuccess("");
    setForbidden(false);

    try {
      const result = await apiRequest("/api/admin/products");
      const list = result.products ?? [];

      setProducts(list);
      setDrafts(
        Object.fromEntries(
          list.map((product) => [
            product.id,
            {
              price: String(product.price),
              stock: String(product.stock_quantity),
            },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, session]);

  useEffect(() => {
    if (session) void loadProducts();
  }, [session, loadProducts]);

  async function saveProduct(product: Product) {
    const draft = drafts[product.id];

    if (!draft) return;

    const price = Number(draft.price);
    const stock = Number(draft.stock);

    if (!Number.isFinite(price) || price <= 0 || price > 10000000) {
      setError(`Enter a valid price greater than zero for ${product.name}.`);
      return;
    }

    if (!Number.isSafeInteger(stock) || stock < 0 || stock > 10000000) {
      setError(`Enter a valid whole-number stock quantity for ${product.name}.`);
      return;
    }

    setSavingId(product.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          price,
          stock_quantity: stock,
        }),
      });

      if (!result.product) {
        throw new Error("The server did not return the updated product.");
      }

      const updated = result.product;
      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDrafts((current) => ({
        ...current,
        [updated.id]: {
          price: String(updated.price),
          stock: String(updated.stock_quantity),
        },
      }));
      setSuccess(`${updated.name} was updated successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the product.");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(product: Product) {
    setSavingId(product.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !product.is_active }),
      });

      if (!result.product) {
        throw new Error("The server did not return the updated product.");
      }

      const updated = result.product;

      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));

      setSuccess(`${updated.name} is now ${updated.is_active ? "active" : "inactive"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change availability.");
    } finally {
      setSavingId(null);
    }
  }

  function logout() {
    localStorage.removeItem("bhasi-auth-session");
    window.location.assign("/login");
  }

  const filteredProducts = products.filter((product) => {
    const term = search.trim().toLowerCase();

    return (
      !term ||
      product.name.toLowerCase().includes(term) ||
      product.slug.toLowerCase().includes(term) ||
      (product.description ?? "").toLowerCase().includes(term)
    );
  });

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2">
        <LoaderCircle className="animate-spin" />
        Checking session…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
        <section className="w-full max-w-md rounded-2xl border bg-white p-8 text-center">
          <ShieldCheck className="mx-auto mb-4 text-rose-500" size={40} />
          <h1 className="text-2xl font-bold">Admin sign-in required</h1>
          <p className="mt-2 text-sm text-stone-500">Sign in to manage the product catalogue.</p>
          <Button asChild className="mt-6 w-full">
            <Link to="/login">Go to login</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-w-0 bg-stone-50 text-stone-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-5 py-4 md:px-8">
        <div>
          <Link
            to="/admin"
            className="mb-2 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-rose-600"
          >
            <ArrowLeft size={16} />
            Back to overview
          </Link>
          <h1 className="text-2xl font-bold">Product management</h1>
          <p className="mt-1 text-sm text-stone-500">
            Update product prices, stock and availability.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/feedback">
              <MessageSquareText size={16} /> Feedback
            </Link>
          </Button>
          <Button variant="outline" disabled={loading} onClick={() => void loadProducts()}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button variant="outline" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-8">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                {forbidden ? "Administrator access denied" : "Request failed"}
              </p>
              <p className="mt-1">{error}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/login">Go to login</Link>
                </Button>
                {!forbidden && (
                  <Button size="sm" variant="outline" onClick={() => void loadProducts()}>
                    Try again
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <Check size={18} />
            {success}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-stone-500">Products loaded</p>
            <p className="mt-2 text-3xl font-bold">{products.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-stone-500">Active products</p>
            <p className="mt-2 text-3xl font-bold">
              {products.filter((product) => product.is_active).length}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-stone-500">Out of stock</p>
            <p className="mt-2 text-3xl font-bold">
              {products.filter((product) => product.stock_quantity === 0).length}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Catalogue</h2>
                <p className="mt-1 text-sm text-stone-500">Changes are saved to the database.</p>
              </div>
              <span className="text-sm text-stone-500">{filteredProducts.length} shown</span>
            </div>

            <label className="relative mt-4 block max-w-xl">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                className="w-full rounded-lg border px-3 py-2.5 pl-9 text-sm outline-none focus:border-rose-400"
                placeholder="Search by product name or description"
                aria-label="Search products"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-stone-500">
              <LoaderCircle className="animate-spin" size={18} />
              Loading products…
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="mx-auto mb-3 text-stone-300" size={34} />
              <p className="font-semibold">No products found</p>
              <p className="mt-1 text-sm text-stone-500">
                {products.length === 0
                  ? "The API returned no products."
                  : "Try a different search."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredProducts.map((product) => {
                const draft = drafts[product.id] ?? {
                  price: String(product.price),
                  stock: String(product.stock_quantity),
                };
                const saving = savingId === product.id;

                return (
                  <article
                    key={product.id}
                    className="grid min-w-0 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] md:p-5"
                  >
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-stone-50">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Package className="text-stone-300" size={28} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words font-semibold">{product.name}</h3>
                        <p className="mt-1 break-words text-xs text-stone-500">{product.slug}</p>
                        {product.description && (
                          <p className="mt-2 line-clamp-2 text-sm text-stone-500">
                            {product.description}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              product.is_active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {product.is_active ? "Active" : "Inactive"}
                          </span>
                          {product.stock_quantity === 0 && (
                            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                              Out of stock
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid content-start gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        <span className="mb-1 block text-stone-500">
                          Price ({product.currency})
                        </span>
                        <input
                          type="number"
                          min="0.01"
                          max="10000000"
                          step="0.01"
                          value={draft.price}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [product.id]: {
                                ...draft,
                                price: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-rose-400"
                        />
                      </label>

                      <label className="text-sm">
                        <span className="mb-1 block text-stone-500">Stock quantity</span>
                        <input
                          type="number"
                          min="0"
                          max="10000000"
                          step="1"
                          value={draft.stock}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [product.id]: {
                                ...draft,
                                stock: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-rose-400"
                        />
                      </label>

                      <Button
                        className="w-full sm:col-span-2"
                        disabled={saving}
                        onClick={() => void saveProduct(product)}
                      >
                        {saving ? (
                          <LoaderCircle size={16} className="animate-spin" />
                        ) : (
                          <Check size={16} />
                        )}
                        Save price and stock
                      </Button>

                      <Button
                        className="w-full sm:col-span-2"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void toggleActive(product)}
                      >
                        {saving ? <LoaderCircle size={16} className="animate-spin" /> : null}
                        {product.is_active ? "Deactivate product" : "Activate product"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p className="text-xs text-stone-500">
          Product edits use the protected admin API. Creating new products and changing product
          images are not available in the current backend.
        </p>
      </main>
    </div>
  );
}
