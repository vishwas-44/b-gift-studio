import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, LoaderCircle, PackageOpen, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyOrders, type OrderHistoryRow } from "@/lib/api/orders";
import { getAuthSession } from "@/lib/api/auth";
import { pageHead } from "@/lib/api/storefront";

export const Route = createFileRoute("/orders")({
  head: () => pageHead("My orders", "View orders placed with Bhasi Gift Studio."),
  component: MyOrders,
});

function money(value: number | string, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function MyOrders() {
  const [orders, setOrders] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getAuthSession()
      .then((user) => {
        if (active) setSignedIn(Boolean(user));
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Unable to verify your sign-in session.",
          );
      });
    void listMyOrders()
      .then((result) => {
        if (active) setOrders(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load orders.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="page-heading">
        <div className="container">
          <span className="eyebrow text-primary">Your order history</span>
          <h1>My orders.</h1>
          <p>Order records and payment status from the backend.</p>
        </div>
      </section>
      <section className="container section">
        {loading ? (
          <p role="status" className="flex items-center gap-2">
            <LoaderCircle className="animate-spin" /> Loading orders…
          </p>
        ) : !signedIn ? (
          <div className="empty-state">
            <PackageOpen size={40} />
            <h2>Sign in to view your orders.</h2>
            <Button asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        ) : error ? (
          <div role="alert" className="status-notice">
            <p>{error}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setLoading(true);
                setError("");
                void listMyOrders()
                  .then(setOrders)
                  .catch((reason: unknown) =>
                    setError(reason instanceof Error ? reason.message : "Unable to load orders."),
                  )
                  .finally(() => setLoading(false));
              }}
            >
              Retry
            </Button>
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={40} />
            <h2>No orders yet.</h2>
            <p>Your confirmed orders will appear here.</p>
            <Button asChild>
              <Link to="/products" search={{}}>
                Explore gifts
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {orders.map((order) => (
              <article key={order.id} className="orders-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{order.order_number}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="capitalize">Order: {order.status}</p>
                    <p className="capitalize text-muted-foreground">
                      Payment: {order.payment_status} · {order.payment_method.replaceAll("_", " ")}
                    </p>
                  </div>
                </div>
                <section className="mt-4 rounded-lg border bg-muted/40 p-4">
                  <h3 className="font-semibold">Shipment tracking</h3>
                  {order.payment_method === "manual_upi_qr" && (
                    <p className="mt-2 text-sm">
                      {order.payment_status === "paid"
                        ? "Your UPI payment has been verified."
                        : order.manual_payment_reference
                          ? `UPI reference ${order.manual_payment_reference} submitted · awaiting bank verification.`
                          : "UPI payment is pending. Complete payment and submit your transaction reference."}
                    </p>
                  )}
                  {order.courier_company || order.tracking_id || order.shipment_date ? (
                    <div className="mt-2 space-y-1 text-sm">
                      {order.courier_company && (
                        <p>
                          <span className="text-muted-foreground">Courier:</span>{" "}
                          {order.courier_company === "Other"
                            ? order.custom_courier_name
                            : order.courier_company}
                        </p>
                      )}
                      {order.tracking_id && (
                        <p>
                          <span className="text-muted-foreground">Tracking ID:</span>{" "}
                          <span className="select-all font-medium">{order.tracking_id}</span>
                        </p>
                      )}
                      {order.shipment_date && (
                        <p>
                          <span className="text-muted-foreground">Handover date:</span>{" "}
                          {new Date(`${order.shipment_date}T00:00:00`).toLocaleDateString()}
                        </p>
                      )}
                      {Number(order.courier_charge) > 0 && (
                        <p>
                          <span className="text-muted-foreground">Courier bill:</span>{" "}
                          {money(order.courier_charge, order.currency || "INR")} ·{" "}
                          {order.courier_charge_payment_status === "paid"
                            ? `Paid by ${order.courier_charge_paid_by}`
                            : "Due to courier on delivery"}
                        </p>
                      )}
                      {order.tracking_url && (
                        <Button asChild size="sm" className="mt-2">
                          <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                            Track shipment
                          </a>
                        </Button>
                      )}
                      {order.status !== "shipped" && order.status !== "delivered" && (
                        <p className="mt-2 text-muted-foreground">
                          Your order has not been marked shipped yet. The courier may not show
                          tracking updates until the parcel is handed over.
                        </p>
                      )}
                      {(order.status === "shipped" || order.status === "delivered") &&
                        !order.tracking_url && (
                          <p className="mt-2 text-muted-foreground">
                            The courier tracking link is not available yet.
                          </p>
                        )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Your order is being prepared. Shipment details will appear here after they are
                      saved.
                    </p>
                  )}
                </section>
                <ul className="mt-4 divide-y">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4 py-3 text-sm">
                      <span>
                        {item.product_name} · {item.variant} × {item.quantity}
                        {item.customization_snapshot?.designId ? " · Personalized" : ""}
                      </span>
                      <span>
                        {money(Number(item.unit_price) * item.quantity, order.currency || "INR")}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
                  <span>Total · {order.payment_status}</span>
                  <span>{money(order.total_amount, order.currency || "INR")}</span>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/track-order" search={{ orderId: order.id }}>
                      <Truck /> Track order
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
