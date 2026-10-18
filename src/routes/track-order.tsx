import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, PackageCheck, PackageOpen, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyOrders, type OrderHistoryRow } from "@/lib/api/orders";
import { pageHead } from "@/lib/api/storefront";

export const Route = createFileRoute("/track-order")({
  validateSearch: (search: Record<string, unknown>) => ({
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
  }),
  head: () => pageHead("Track your order", "View the latest order and courier details."),
  component: TrackOrder,
});

function TrackOrder() {
  const { orderId } = Route.useSearch();
  const [orders, setOrders] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    listMyOrders()
      .then((rows) => {
        if (active) setOrders(rows);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Unable to load order details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const order = orders.find((row) => row.id === orderId || row.order_number === orderId);
  const stages = [
    { id: "pending", label: "Order placed", icon: PackageOpen },
    { id: "processing", label: "Processing", icon: PackageCheck },
    { id: "shipped", label: "Shipped", icon: Truck },
    { id: "delivered", label: "Delivered", icon: PackageCheck },
  ];
  const current = order ? stages.findIndex((stage) => stage.id === order.status) : -1;
  const courier =
    order?.courier_company === "Other" ? order.custom_courier_name : order?.courier_company;

  return (
    <>
      <section className="page-heading">
        <div className="container">
          <span className="eyebrow text-primary">Order updates</span>
          <h1>Track your order.</h1>
          <p>Shipment information shared by Bhasi Gift Studio.</p>
        </div>
      </section>
      <div className="container section tracking-page">
        {loading ? (
          <div className="tracking-card" role="status">
            Loading your order…
          </div>
        ) : error ? (
          <div className="status-notice" role="alert">
            {error}
            <p className="mt-2">Sign in to view your order tracking details.</p>
          </div>
        ) : !order ? (
          <div className="empty-state">
            <PackageOpen size={40} />
            <h2>Order not found</h2>
            <p>Choose one of your account orders to view its tracking details.</p>
            <Button asChild>
              <Link to="/orders">View my orders</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="tracking-title">
              <div>
                <p className="text-sm text-muted-foreground">Order ID</p>
                <h2>{order.order_number}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Placed {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
              <span className="order-status">{order.status.replaceAll("_", " ")}</span>
            </div>
            <div className="tracking-card">
              {order.status === "cancelled" ? (
                <p>This order is cancelled.</p>
              ) : (
                <div className="tracking-steps">
                  {stages.map((stage, index) => {
                    const Icon = stage.icon;
                    const done = current >= 0 && index <= current;
                    return (
                      <div
                        className={`tracking-stage ${done ? "tracking-stage-done" : ""}`}
                        key={stage.id}
                      >
                        <span>
                          <Icon size={18} />
                        </span>
                        <strong>{stage.label}</strong>
                        {stage.id === "pending" && (
                          <small>{new Date(order.created_at).toLocaleDateString()}</small>
                        )}
                        {stage.id === "shipped" && order.shipment_date && (
                          <small>
                            {new Date(`${order.shipment_date}T00:00:00`).toLocaleDateString()}
                          </small>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="tracking-details-grid">
              <section className="tracking-card">
                <h2>Shipment tracking</h2>
                {courier || order.tracking_id || order.shipment_date ? (
                  <div className="tracking-facts">
                    {courier && (
                      <p>
                        <span>Courier</span>
                        <strong>{courier}</strong>
                      </p>
                    )}
                    {order.tracking_id && (
                      <p>
                        <span>Tracking ID</span>
                        <strong className="select-all">{order.tracking_id}</strong>
                      </p>
                    )}
                    {order.shipment_date && (
                      <p>
                        <span>Handover date</span>
                        <strong>
                          {new Date(`${order.shipment_date}T00:00:00`).toLocaleDateString()}
                        </strong>
                      </p>
                    )}
                    {Number(order.courier_charge) > 0 && (
                      <p>
                        <span>Courier bill</span>
                        <strong>
                          {new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: order.currency || "INR",
                          }).format(Number(order.courier_charge))}
                          {" · "}
                          {order.courier_charge_payment_status === "paid"
                            ? `Paid by ${order.courier_charge_paid_by}`
                            : "Due to courier on delivery"}
                        </strong>
                      </p>
                    )}
                    {order.tracking_url && (
                      <Button asChild className="mt-4 w-full">
                        <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                          Open courier tracking <ExternalLink />
                        </a>
                      </Button>
                    )}
                    {order.status !== "shipped" && order.status !== "delivered" && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Courier tracking details are saved. The order status will update after
                        handover is confirmed.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Your order is being prepared. Shipment and tracking details will appear here
                    after they are saved.
                  </p>
                )}
              </section>
              <section className="tracking-card">
                <h2>Items in this order</h2>
                <ul className="tracking-items">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.product_name}</strong>
                        <small>
                          {item.variant} · Qty {item.quantity}
                          {item.customization_snapshot?.designId ? " · Personalized" : ""}
                        </small>
                      </span>
                      <span>
                        {new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: order.currency || "INR",
                        }).format(Number(item.unit_price) * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="tracking-total">
                  <span>Total · {order.payment_status}</span>
                  <strong>
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: order.currency || "INR",
                    }).format(Number(order.total_amount))}
                  </strong>
                </div>
              </section>
            </div>
            <Button variant="outline" asChild className="mt-5">
              <Link to="/orders">
                <ArrowLeft /> Back to my orders
              </Link>
            </Button>
          </>
        )}
      </div>
    </>
  );
}
