import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
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

type Session = {
  access_token: string;
};

type OrderItem = {
  id: string;
  product_name: string;
  variant: string;
  quantity: number;
  unit_price: number | string;
  customization_snapshot: Record<string, unknown> | null;
  artworks?: Array<{
    index: number;
    previewUrl: string;
    downloadUrl: string;
    mimeType: string;
    expiresInSeconds: number;
  }>;
  artwork?: {
    previewUrl: string;
    downloadUrl: string;
    mimeType: string;
    expiresInSeconds: number;
  } | null;
};

type Order = {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number | string;
  shipping_fee: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  shipping_address: Record<string, unknown> | null;
  recipient_details: Record<string, unknown> | null;
  customer_note: string | null;
  created_at: string;
  updated_at: string;
  courier_company: string | null;
  custom_courier_name: string | null;
  tracking_id: string | null;
  shipment_date: string | null;
  tracking_url: string | null;
  courier_charge: number | string;
  courier_charge_paid_by: "admin" | "customer";
  courier_charge_payment_status: "paid" | "unpaid";
  manual_payment_reference: string | null;
  manual_payment_reference_submitted_at: string | null;
  payment_verified_at: string | null;
  payment_verified_by: string | null;
  shipment_created_at: string | null;
  shipment_updated_at: string | null;
  items?: OrderItem[];
};

type FulfillmentDraft = {
  status: string;
  courierCompany: string;
  customCourierName: string;
  trackingId: string;
  shipmentDate: string;
  trackingUrl: string;
  courierCharge: string;
  courierChargePaidBy: "admin" | "customer";
  courierChargePaymentStatus: "paid" | "unpaid";
};

type ApiResponse = {
  success: boolean;
  message?: string;
  orders?: Order[];
  order?: Order;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const Route = createFileRoute("/admin_/orders")({
  head: () =>
    pageHead("Manage Orders", "View Bhasi Gift Studio customer orders and customization details."),
  component: AdminOrdersPage,
});

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function date(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeClass(value: string) {
  const status = value.toLowerCase();

  if (["paid", "delivered", "completed"].includes(status)) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (["cancelled", "failed", "refunded"].includes(status)) {
    return "bg-red-100 text-red-800";
  }

  if (["processing", "shipped"].includes(status)) {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-amber-100 text-amber-800";
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not provided";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return JSON.stringify(value, null, 2);
}

function DetailFields({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown> | null | undefined;
}) {
  if (!value || Object.keys(value).length === 0) {
    return (
      <section className="rounded-xl border bg-white p-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-stone-500">No details provided.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-white p-5">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-4 space-y-3">
        {Object.entries(value).map(([key, fieldValue]) => (
          <div key={key}>
            <dt className="text-xs capitalize text-stone-500">{key.replaceAll("_", " ")}</dt>
            <dd className="mt-1 break-words text-sm">{displayValue(fieldValue)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AdminOrdersPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [fulfillment, setFulfillment] = useState<FulfillmentDraft>({
    status: "pending",
    courierCompany: "",
    customCourierName: "",
    trackingId: "",
    shipmentDate: "",
    trackingUrl: "",
    courierCharge: "0",
    courierChargePaidBy: "admin",
    courierChargePaymentStatus: "paid",
  });
  const [savingFulfillment, setSavingFulfillment] = useState(false);
  const [confirmHandover, setConfirmHandover] = useState(false);
  const [fulfillmentMessage, setFulfillmentMessage] = useState("");
  const [savingPaymentVerification, setSavingPaymentVerification] = useState(false);
  const [paymentVerificationMessage, setPaymentVerificationMessage] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bhasi-auth-session");

      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Session>;

        if (typeof parsed.access_token === "string" && parsed.access_token.length > 0) {
          setSession({ access_token: parsed.access_token });
        }
      }
    } catch {
      setError("The saved login session could not be read. Please log in again.");
    } finally {
      setSessionChecked(true);
    }
  }, []);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!session?.access_token) {
      throw new Error("Your session is missing. Please log in again.");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      ...init,
    });

    const result = (await response.json()) as ApiResponse;

    if (response.status === 401) {
      throw new Error("Your session has expired. Please log in again.");
    }

    if (response.status === 403) {
      setForbidden(true);
      throw new Error("This account does not have administrator access.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "The request failed.");
    }

    return result as T;
  }

  async function loadOrders(nextPage = page) {
    if (!session) return;

    setLoading(true);
    setError("");
    setForbidden(false);

    const params = new URLSearchParams({
      page: String(nextPage),
      limit: "10",
    });

    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (paymentStatus) params.set("payment_status", paymentStatus);

    try {
      const result = await request<ApiResponse>(`/api/admin/orders?${params.toString()}`);

      setOrders(result.orders ?? []);
      setTotal(result.pagination?.total ?? 0);
      setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
      setPage(result.pagination?.page ?? nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }

  async function openOrder(id: string) {
    setDetailLoading(true);
    setError("");
    setSelectedOrder(null);

    try {
      const result = await request<ApiResponse>(`/api/admin/orders/${encodeURIComponent(id)}`);

      if (!result.order) {
        throw new Error("The server did not return order details.");
      }

      setSelectedOrder(result.order);
      setFulfillment({
        status: result.order.status,
        courierCompany: result.order.courier_company || "",
        customCourierName: result.order.custom_courier_name || "",
        trackingId: result.order.tracking_id || "",
        shipmentDate: result.order.shipment_date || "",
        trackingUrl: result.order.tracking_url || "",
        courierCharge: String(result.order.courier_charge ?? 0),
        courierChargePaidBy: result.order.courier_charge_paid_by || "admin",
        courierChargePaymentStatus: result.order.courier_charge_payment_status || "paid",
      });
      setFulfillmentMessage("");
      setPaymentVerificationMessage("");
      setConfirmHandover(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load order details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveFulfillment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    setSavingFulfillment(true);
    setError("");
    setFulfillmentMessage("");
    try {
      const result = await request<ApiResponse>(
        `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/fulfillment`,
        { method: "PATCH", body: JSON.stringify({ ...fulfillment, confirmHandover }) },
      );
      if (!result.order) throw new Error("The server did not confirm the saved order update.");
      setSelectedOrder(result.order);
      setFulfillmentMessage("Order fulfillment saved successfully.");
      void loadOrders(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save fulfillment details.");
    } finally {
      setSavingFulfillment(false);
    }
  }

  async function verifyManualPayment() {
    if (!selectedOrder || !selectedOrder.manual_payment_reference) return;
    if (
      !window.confirm(
        `Confirm that ₹${Number(selectedOrder.total_amount).toFixed(2)} was received for ${selectedOrder.order_number} in the merchant bank account?`,
      )
    )
      return;
    setSavingPaymentVerification(true);
    setError("");
    setPaymentVerificationMessage("");
    try {
      const result = await request<ApiResponse>(
        `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/manual-payment/verify`,
        { method: "PATCH" },
      );
      if (!result.order) throw new Error("The server did not confirm payment verification.");
      setSelectedOrder((current) => (current ? { ...current, ...result.order } : current));
      setPaymentVerificationMessage("Payment verified and marked paid.");
      void loadOrders(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify payment.");
    } finally {
      setSavingPaymentVerification(false);
    }
  }

  useEffect(() => {
    if (session) void loadOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, search, status, paymentStatus]);

  function logout() {
    localStorage.removeItem("bhasi-auth-session");
    window.location.assign("/login");
  }

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
          <p className="mt-2 text-sm text-stone-500">Sign in to access order management.</p>
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
            <ArrowLeft size={16} />
            Back to overview
          </Link>
          <h1 className="text-2xl font-bold">Order management</h1>
          <p className="mt-1 text-sm text-stone-500">
            View orders and inspect the saved order details.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/feedback">
              <MessageSquareText size={16} /> Feedback
            </Link>
          </Button>
          <Button variant="outline" disabled={loading} onClick={() => void loadOrders(page)}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button variant="outline" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="space-y-6 p-4 md:p-8">
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
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/login">Go to login</Link>
                </Button>
                {!forbidden && (
                  <Button size="sm" variant="outline" onClick={() => void loadOrders(page)}>
                    Try again
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedOrder ? (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <button
                  type="button"
                  className="mb-2 text-sm font-medium text-rose-600 hover:underline"
                  onClick={() => setSelectedOrder(null)}
                >
                  ← Back to all orders
                </button>
                <h2 className="text-xl font-bold">{selectedOrder.order_number}</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Created {date(selectedOrder.created_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${badgeClass(selectedOrder.status)}`}
                >
                  Order: {selectedOrder.status}
                </span>
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${badgeClass(selectedOrder.payment_status)}`}
                >
                  Payment: {selectedOrder.payment_status} ·{" "}
                  {selectedOrder.payment_method.replaceAll("_", " ")}
                </span>
              </div>
            </div>

            {selectedOrder.payment_method === "manual_upi_qr" && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-semibold text-amber-950">Manual UPI payment verification</h3>
                <p className="mt-1 text-sm text-amber-900">
                  Verify the payment in the merchant bank account before marking this order paid.
                </p>
                <p className="mt-3 text-sm">
                  <strong>Customer transaction reference:</strong>{" "}
                  {selectedOrder.manual_payment_reference || "Not submitted yet"}
                </p>
                {selectedOrder.manual_payment_reference_submitted_at && (
                  <p className="mt-1 text-xs text-amber-900">
                    Submitted {date(selectedOrder.manual_payment_reference_submitted_at)}
                  </p>
                )}
                {paymentVerificationMessage && (
                  <p role="status" className="mt-3 text-sm font-medium text-emerald-800">
                    {paymentVerificationMessage}
                  </p>
                )}
                {selectedOrder.payment_status === "unpaid" && (
                  <Button
                    className="mt-4"
                    disabled={savingPaymentVerification || !selectedOrder.manual_payment_reference}
                    onClick={() => void verifyManualPayment()}
                  >
                    {savingPaymentVerification ? "Verifying…" : "Verify bank transfer & mark paid"}
                  </Button>
                )}
                {selectedOrder.payment_verified_at && (
                  <p className="mt-3 text-sm font-medium text-emerald-800">
                    Verified {date(selectedOrder.payment_verified_at)}
                  </p>
                )}
              </section>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <DetailFields title="Shipping address" value={selectedOrder.shipping_address} />
              <DetailFields
                title="Gift recipient details"
                value={selectedOrder.recipient_details}
              />
            </div>

            <section className="rounded-xl border bg-white p-5">
              <h3 className="text-lg font-semibold">Preparation & courier shipment</h3>
              <p className="mt-1 text-sm text-stone-500">
                Save the courier handover details after the courier accepts the parcel. Only then
                can the order be marked shipped.
              </p>
              {fulfillmentMessage && (
                <p
                  role="status"
                  className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                  {fulfillmentMessage}
                </p>
              )}
              <form
                className="mt-5 grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => void saveFulfillment(event)}
              >
                <label className="grid gap-1.5 text-sm font-medium">
                  Order status
                  <select
                    className="rounded-lg border bg-white px-3 py-2.5 font-normal"
                    value={fulfillment.status}
                    onChange={(event) =>
                      setFulfillment((draft) => ({ ...draft, status: event.target.value }))
                    }
                  >
                    <option value={selectedOrder.status}>{selectedOrder.status}</option>
                    {selectedOrder.status === "pending" && (
                      <>
                        <option value="processing">Preparing</option>
                        <option value="cancelled">Cancelled</option>
                      </>
                    )}
                    {selectedOrder.status === "processing" && (
                      <>
                        <option value="shipped">Shipped (confirm courier handover)</option>
                        <option value="cancelled">Cancelled</option>
                      </>
                    )}
                    {selectedOrder.status === "shipped" && (
                      <option value="delivered">Delivered (confirmed)</option>
                    )}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Courier company
                  <select
                    className="rounded-lg border bg-white px-3 py-2.5 font-normal"
                    value={fulfillment.courierCompany}
                    onChange={(event) =>
                      setFulfillment((draft) => ({ ...draft, courierCompany: event.target.value }))
                    }
                  >
                    <option value="">Select courier</option>
                    <option value="FedEx">FedEx</option>
                    <option value="DHL">DHL</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                {fulfillment.courierCompany === "Other" && (
                  <label className="grid gap-1.5 text-sm font-medium">
                    Courier name
                    <input
                      className="rounded-lg border px-3 py-2.5 font-normal"
                      maxLength={100}
                      required={fulfillment.status === "shipped"}
                      value={fulfillment.customCourierName}
                      onChange={(event) =>
                        setFulfillment((draft) => ({
                          ...draft,
                          customCourierName: event.target.value,
                        }))
                      }
                      placeholder="Enter courier company"
                    />
                  </label>
                )}
                <label className="grid gap-1.5 text-sm font-medium">
                  Tracking ID
                  <input
                    className="rounded-lg border px-3 py-2.5 font-normal"
                    maxLength={120}
                    required={fulfillment.status === "shipped"}
                    value={fulfillment.trackingId}
                    onChange={(event) =>
                      setFulfillment((draft) => ({ ...draft, trackingId: event.target.value }))
                    }
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Courier handover date
                  <input
                    className="rounded-lg border px-3 py-2.5 font-normal"
                    type="date"
                    required={fulfillment.status === "shipped"}
                    value={fulfillment.shipmentDate}
                    onChange={(event) =>
                      setFulfillment((draft) => ({ ...draft, shipmentDate: event.target.value }))
                    }
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  Official tracking URL
                  <input
                    className="rounded-lg border px-3 py-2.5 font-normal"
                    type="url"
                    inputMode="url"
                    maxLength={2048}
                    placeholder="https://courier.example/track/…"
                    required={fulfillment.status === "shipped"}
                    value={fulfillment.trackingUrl}
                    onChange={(event) =>
                      setFulfillment((draft) => ({ ...draft, trackingUrl: event.target.value }))
                    }
                  />
                  <span className="font-normal text-stone-500">
                    Use the courier’s official tracking page. HTTPS is preferred.
                  </span>
                </label>
                <div className="grid gap-4 rounded-lg border bg-stone-50 p-4 sm:col-span-2 sm:grid-cols-3">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Courier bill amount (₹)
                    <input
                      className="rounded-lg border bg-white px-3 py-2.5 font-normal"
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      required
                      value={fulfillment.courierCharge}
                      onChange={(event) =>
                        setFulfillment((draft) => ({ ...draft, courierCharge: event.target.value }))
                      }
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Courier bill paid by
                    <select
                      className="rounded-lg border bg-white px-3 py-2.5 font-normal"
                      value={fulfillment.courierChargePaidBy}
                      onChange={(event) => {
                        const payer = event.target.value as "admin" | "customer";
                        setFulfillment((draft) => ({
                          ...draft,
                          courierChargePaidBy: payer,
                          courierChargePaymentStatus: payer === "admin" ? "paid" : "unpaid",
                        }));
                      }}
                    >
                      <option value="admin">Admin paid courier</option>
                      <option value="customer">Customer pays courier</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Courier bill status
                    <select
                      className="rounded-lg border bg-white px-3 py-2.5 font-normal"
                      value={
                        fulfillment.courierChargePaidBy === "admin"
                          ? "paid"
                          : fulfillment.courierChargePaymentStatus
                      }
                      disabled={fulfillment.courierChargePaidBy === "admin"}
                      onChange={(event) =>
                        setFulfillment((draft) => ({
                          ...draft,
                          courierChargePaymentStatus: event.target.value as "paid" | "unpaid",
                        }))
                      }
                    >
                      <option value="paid">Paid</option>
                      <option value="unpaid">Due from customer</option>
                    </select>
                  </label>
                  <p className="text-xs font-normal text-stone-500 sm:col-span-3">
                    This records the courier&apos;s bill separately from the order total. If the
                    customer owes it, the amount and due status appear in their tracking page.
                  </p>
                </div>
                {fulfillment.status === "shipped" && (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950 sm:col-span-2">
                    <input
                      type="checkbox"
                      className="mt-1 accent-rose-600"
                      required
                      checked={confirmHandover}
                      onChange={(event) => setConfirmHandover(event.target.checked)}
                    />
                    I confirm the courier has physically accepted this parcel and issued the
                    tracking ID.
                  </label>
                )}
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={savingFulfillment}>
                    {savingFulfillment ? (
                      <>
                        <LoaderCircle size={16} className="animate-spin" /> Saving…
                      </>
                    ) : fulfillment.status === "shipped" ? (
                      "Save details & confirm courier handover"
                    ) : (
                      "Save order update"
                    )}
                  </Button>
                </div>
              </form>
              {selectedOrder.tracking_id && (
                <div className="mt-5 rounded-lg bg-stone-50 p-4 text-sm">
                  <p>
                    <strong>Saved courier:</strong>{" "}
                    {selectedOrder.courier_company === "Other"
                      ? selectedOrder.custom_courier_name
                      : selectedOrder.courier_company}
                  </p>
                  <p className="mt-1">
                    <strong>Tracking ID:</strong> {selectedOrder.tracking_id}
                  </p>
                  <p className="mt-1">
                    <strong>Handover date:</strong> {selectedOrder.shipment_date || "Not set"}
                  </p>
                  <p className="mt-1">
                    <strong>Courier bill:</strong> {money(selectedOrder.courier_charge)} ·{" "}
                    {selectedOrder.courier_charge_payment_status === "paid"
                      ? `Paid by ${selectedOrder.courier_charge_paid_by}`
                      : "Due from customer"}
                  </p>
                  {selectedOrder.tracking_url && (
                    <a
                      className="mt-2 inline-block text-rose-600 underline"
                      href={selectedOrder.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open saved tracking page
                    </a>
                  )}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border bg-white">
              <div className="border-b p-5">
                <h3 className="font-semibold">Items in this order</h3>
              </div>

              {!selectedOrder.items?.length ? (
                <p className="p-5 text-sm text-stone-500">No order items were returned.</p>
              ) : (
                <div className="divide-y">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="space-y-4 p-5">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.product_name}</p>
                          <p className="mt-1 text-sm text-stone-500">Quantity: {item.quantity}</p>
                        </div>
                        <p className="font-semibold">
                          {money(Number(item.unit_price) * item.quantity)}
                        </p>
                      </div>

                      {item.customization_snapshot?.designId ? (
                        <div className="grid gap-3 rounded-lg bg-stone-50 p-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {String(item.customization_snapshot.designName || "Saved design")}
                            </p>
                            {item.artworks?.length || item.artwork ? (
                              <>
                                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                  {(item.artworks?.length
                                    ? item.artworks
                                    : item.artwork
                                      ? [{ ...item.artwork, index: 1 }]
                                      : []
                                  ).map((artwork) => (
                                    <div
                                      key={artwork.index}
                                      className="rounded-md border bg-white p-2"
                                    >
                                      <a
                                        href={artwork.previewUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <img
                                          src={artwork.previewUrl}
                                          alt={`Customer photo ${artwork.index} for ${item.product_name}`}
                                          className="h-32 w-full rounded object-contain"
                                        />
                                      </a>
                                      <a
                                        className="mt-2 inline-flex w-full justify-center rounded-md bg-rose-600 px-2 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                                        href={artwork.downloadUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Download photo {artwork.index}
                                      </a>
                                    </div>
                                  ))}
                                </div>
                                <p className="mt-1 text-xs text-stone-500">
                                  Original photos stay separate. Private download links expire in 15
                                  minutes.
                                </p>
                              </>
                            ) : (
                              <p className="mt-2 text-sm text-amber-800">
                                A saved design is attached, but its image is unavailable. Ask the
                                customer to reopen and resave the design.
                              </p>
                            )}
                          </div>
                          <details>
                            <summary className="cursor-pointer text-xs font-medium text-stone-600">
                              View design text and print positions
                            </summary>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">
                              {JSON.stringify(
                                item.customization_snapshot.designData || {},
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                          No saved customization or artwork was attached to this order item. The
                          customer must save the design and add that customized item to the bag
                          before ordering.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="ml-auto max-w-md rounded-xl border bg-white p-5">
              <h3 className="font-semibold">Order totals</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">Subtotal</dt>
                  <dd>{money(selectedOrder.subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">Shipping</dt>
                  <dd>{money(selectedOrder.shipping_fee)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">Tax</dt>
                  <dd>{money(selectedOrder.tax_amount)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t pt-3 text-base font-bold">
                  <dt>Total</dt>
                  <dd>{money(selectedOrder.total_amount)}</dd>
                </div>
              </dl>

              <p className="mt-4 text-xs text-stone-500">Customer ID: {selectedOrder.user_id}</p>

              {selectedOrder.customer_note && (
                <div className="mt-4 rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Customer note</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
                    {selectedOrder.customer_note}
                  </p>
                </div>
              )}
            </section>
          </section>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-white p-5">
                <p className="text-sm text-stone-500">Matching orders</p>
                <p className="mt-2 text-3xl font-bold">{total}</p>
              </div>
              <div className="rounded-xl border bg-white p-5">
                <p className="text-sm text-stone-500">Current page</p>
                <p className="mt-2 text-3xl font-bold">
                  {page} <span className="text-lg text-stone-400">/ {totalPages}</span>
                </p>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border bg-white">
              <div className="border-b p-5">
                <h2 className="text-lg font-bold">All orders</h2>
                <form
                  className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_190px_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setPage(1);
                    setSearch(searchInput.trim());
                  }}
                >
                  <label className="relative">
                    <Search
                      size={17}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                    />
                    <input
                      className="w-full rounded-lg border px-3 py-2.5 pl-9 text-sm outline-none focus:border-rose-400"
                      placeholder="Search order number"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                    />
                  </label>

                  <select
                    aria-label="Order status filter"
                    className="rounded-lg border bg-white px-3 py-2.5 text-sm"
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
                    aria-label="Payment status filter"
                    className="rounded-lg border bg-white px-3 py-2.5 text-sm"
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

              {loading || detailLoading ? (
                <div className="flex items-center justify-center gap-2 p-12 text-sm text-stone-500">
                  <LoaderCircle className="animate-spin" size={18} />
                  Loading…
                </div>
              ) : orders.length === 0 ? (
                <div className="p-12 text-center">
                  <Package className="mx-auto mb-3 text-stone-300" size={32} />
                  <p className="font-semibold">No orders found</p>
                  <p className="mt-1 text-sm text-stone-500">
                    Try changing the filters or check again when orders exist.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                      <tr>
                        <th className="px-5 py-4">Order</th>
                        <th className="px-5 py-4">Date</th>
                        <th className="px-5 py-4">Order status</th>
                        <th className="px-5 py-4">Payment</th>
                        <th className="px-5 py-4 text-right">Total</th>
                        <th className="px-5 py-4">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-rose-50/30">
                          <td className="px-5 py-4 font-semibold">{order.order_number}</td>
                          <td className="px-5 py-4 text-stone-500">{date(order.created_at)}</td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(order.status)}`}
                            >
                              {order.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(order.payment_status)}`}
                            >
                              {order.payment_status} · {order.payment_method.replaceAll("_", " ")}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-semibold">
                            {money(order.total_amount)}
                          </td>
                          <td className="px-5 py-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void openOrder(order.id)}
                            >
                              View order
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
                <p className="text-sm text-stone-500">
                  {total === 0
                    ? "No matching orders"
                    : `Showing ${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} of ${total}`}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading || page <= 1}
                    onClick={() => void loadOrders(page - 1)}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading || page >= totalPages}
                    onClick={() => void loadOrders(page + 1)}
                  >
                    Next
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </section>
          </>
        )}

        <p className="flex items-center gap-2 text-xs text-stone-500">
          <ClipboardList size={14} />
          Payment status stays unchanged here; unpaid orders remain unpaid until a verified payment
          integration exists.
        </p>
      </main>
    </div>
  );
}
