import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CreditCard, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currency, getProduct } from "@/data/catalogue";
import { useStore } from "@/features/storefront/store-context";
import { pageHead } from "@/lib/api/storefront";
export const Route = createFileRoute("/checkout")({
  head: () =>
    pageHead(
      "Demo checkout",
      "Preview your gift summary. No payments are collected and no orders are created in this frontend demo.",
    ),
  component: Checkout,
});
function Checkout() {
  const { cart, total, ready } = useStore();
  const [reviewed, setReviewed] = useState(false);
  if (!ready)
    return (
      <div className="empty-state" role="status">
        Opening checkout…
      </div>
    );
  if (!cart.length)
    return (
      <div className="empty-state">
        <ShoppingBag size={40} />
        <h2>Your bag needs a little love.</h2>
        <p>Add a gift before previewing checkout.</p>
        <Button asChild>
          <Link to="/products" search={{}}>
            Explore gifts
          </Link>
        </Button>
      </div>
    );
  return (
    <>
      <section className="page-heading">
        <div className="container">
          <span className="eyebrow text-primary">Demo only · No payment</span>
          <h1>One step closer to their smile.</h1>
          <p>A preview of checkout. Not a real purchase.</p>
        </div>
      </section>
      <div className="container checkout-layout">
        <div>
          <h2>Before the real thing</h2>
          <div className="demo-notice mt-6">
            <strong>Payment integration pending</strong>
            <br />
            No delivery details or payment information are collected. This action only reviews your
            local bag. It does not place an order, charge you, or send a confirmation.
          </div>
          <div className="mt-8 flex items-center gap-3">
            <CreditCard className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Payments & delivery · Coming soon</span>
          </div>
          <Button size="lg" className="mt-8" onClick={() => setReviewed(true)}>
            Review demo checkout
          </Button>
          {reviewed && (
            <div className="auth-feedback mt-5" role="status">
              <CheckCircle2 className="mb-2 text-primary" size={22} />
              <strong>Demo review complete — no order placed.</strong>
              <br />
              Your bag is unchanged. Payment, shipping calculation, and order creation are still
              pending integration.
            </div>
          )}
          <Button variant="link" asChild className="mt-6">
            <Link to="/cart">
              <ArrowLeft />
              Back to your bag
            </Link>
          </Button>
        </div>
        <div>
          <h2>Your thoughtful little things</h2>
          <div className="checkout-list">
            {cart.map((item) => (
              <div key={item.key}>
                <span>
                  {getProduct(item.productId)?.name}
                  <span className="block mt-1 text-xs text-muted-foreground">
                    {item.variant} · Qty {item.quantity}
                  </span>
                </span>
                <span>{currency((getProduct(item.productId)?.price || 0) * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between font-semibold">
            <span>Demo subtotal</span>
            <span>{currency(total)}</span>
          </div>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            Shipping and tax are not included in the demo subtotal. Calculated after backend
            configuration.
          </p>
        </div>
      </div>
    </>
  );
}
