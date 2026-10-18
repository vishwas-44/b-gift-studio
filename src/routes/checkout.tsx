import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, LoaderCircle, QrCode, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/features/storefront/store-context";
import {
  createCashOnDeliveryOrder,
  createManualUpiQrOrder,
  createRazorpayOrder,
  getCheckoutPaymentMethods,
  getSavedDeliveryAddress,
  submitManualPaymentReference,
  verifyRazorpayPayment,
  type RazorpayPaymentOrder,
  type CreatedOrder,
  type DeliveryAddress,
} from "@/lib/api/orders";
import { pageHead } from "@/lib/api/storefront";

const blankAddress: DeliveryAddress = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

type RazorpayResponse = { razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; contact: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (
        event: "payment.failed",
        callback: (response: { error?: { description?: string } }) => void,
      ) => void;
    };
  }
}

function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay-checkout]");
    const script = existing || document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () =>
      window.Razorpay ? resolve() : reject(new Error("Razorpay Checkout did not load."));
    script.onerror = () => {
      script.remove();
      reject(new Error("Could not load Razorpay Checkout. Check your connection and retry."));
    };
    if (!existing) document.body.appendChild(script);
  });
}

export const Route = createFileRoute("/checkout")({
  head: () => pageHead("Checkout", "Enter delivery details and pay securely with Razorpay."),
  component: Checkout,
});

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value);
}

function Checkout() {
  const { cart, ready, designsReady, products, productsReady, clearCart, saveDesign } = useStore();
  const [address, setAddress] = useState(blankAddress);
  const [addressLoading, setAddressLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncingDesigns, setSyncingDesigns] = useState(false);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [pendingPayment, setPendingPayment] = useState<{
    order: CreatedOrder;
    payment: RazorpayPaymentOrder;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<
    "razorpay" | "cash_on_delivery" | "manual_upi_qr"
  >("cash_on_delivery");
  const [availableMethods, setAvailableMethods] = useState({
    razorpay: false,
    cashOnDelivery: true,
    manualUpiQr: false,
    upiQrImageUrl: "",
    merchantUpiId: "",
  });
  const [paymentReference, setPaymentReference] = useState("");
  const [referenceSubmitted, setReferenceSubmitted] = useState(false);
  const [submittingReference, setSubmittingReference] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      const session = JSON.parse(localStorage.getItem("bhasi-auth-session") || "null");
      setSignedIn(typeof session?.access_token === "string" && session.access_token.length > 0);
    } catch {
      setSignedIn(false);
    }
    void getSavedDeliveryAddress()
      .then((saved) => {
        if (active && saved) setAddress(saved);
      })
      .catch((reason: unknown) => {
        if (active && reason instanceof Error && !reason.message.includes("Sign in")) {
          if (reason.message === "Invalid or expired session.") {
            localStorage.removeItem("bhasi-auth-session");
            setSignedIn(false);
            setError("Your sign-in session expired. Sign in again to continue checkout.");
          } else {
            setError(reason.message);
          }
        }
      })
      .finally(() => {
        if (active) setAddressLoading(false);
      });
    void getCheckoutPaymentMethods()
      .then((methods) => {
        if (active) {
          setAvailableMethods(methods);
        }
      })
      .catch(() => {
        if (active)
          setAvailableMethods({
            razorpay: false,
            cashOnDelivery: true,
            manualUpiQr: false,
            upiQrImageUrl: "",
            merchantUpiId: "",
          });
      });
    return () => {
      active = false;
    };
  }, []);

  const currencyCode = products[0]?.currencyCode || "INR";
  const lines = cart.map((item) => ({
    item,
    product: products.find((row) => row.id === item.productId),
  }));
  const subtotal = lines.reduce(
    (sum, line) => sum + (line.product?.price || 0) * line.item.quantity,
    0,
  );
  const localDesigns = designsReady
    ? cart.filter((item) => item.designId && !item.design?.remote)
    : [];

  async function syncLocalDesigns() {
    if (!designsReady || syncingDesigns || !localDesigns.length) return;
    setSyncingDesigns(true);
    setError("");
    setNotice("");
    try {
      const seen = new Set<string>();
      for (const item of localDesigns) {
        if (!item.designId || seen.has(item.designId)) continue;
        seen.add(item.designId);
        if (!item.design) {
          throw new Error(
            "A design in your bag could not be opened. Visit Saved designs and retry.",
          );
        }
        const product = products.find((row) => row.id === item.productId);
        await saveDesign({
          id: item.designId,
          name: `${product?.name || "Gift"} design`,
          productId: item.productId,
          variant: item.variant,
          artwork: item.design.artwork,
          artworks: item.design.artworks,
          texts: item.design.texts,
        });
      }
      setNotice("Your designs are now saved to your account. Browser copies are still available.");
    } catch (reason) {
      if (reason instanceof Error && reason.message === "Invalid or expired session.") {
        localStorage.removeItem("bhasi-auth-session");
        setSignedIn(false);
        setError(
          "Your sign-in session expired. Sign in again to place this order. Your bag is unchanged.",
        );
        setSubmitting(false);
        return;
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to sync the designs. Your browser copies are unchanged.",
      );
    } finally {
      setSyncingDesigns(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!signedIn) {
      setError("Sign in before placing an order.");
      return;
    }
    if (!productsReady || lines.some((line) => !line.product?.backendId)) {
      setError(
        "Product details are still loading or a cart item is unavailable. Refresh and try again.",
      );
      return;
    }
    if (!designsReady) {
      setError("Your saved designs are still loading. Please wait a moment and try again.");
      return;
    }
    if (localDesigns.length) {
      setError("Save the designs in your bag to your account before placing the order.");
      return;
    }
    setSubmitting(true);
    let awaitingPayment = false;
    try {
      const items = lines.map(({ item, product }) => ({
        productId: product!.backendId,
        variant: item.variant,
        quantity: item.quantity,
        ...(item.designId ? { designId: item.designId } : {}),
      }));
      if (paymentMethod === "cash_on_delivery") {
        const codOrder = await createCashOnDeliveryOrder({ shippingAddress: address, items });
        setOrder(codOrder);
        clearCart();
        return;
      }
      if (paymentMethod === "manual_upi_qr") {
        const manualOrder = await createManualUpiQrOrder({ shippingAddress: address, items });
        setOrder(manualOrder);
        clearCart();
        return;
      }
      const checkoutOrder =
        pendingPayment ||
        (await createRazorpayOrder({
          shippingAddress: address,
          items,
        }));
      const { order: created, payment } = checkoutOrder;
      setPendingPayment(checkoutOrder);
      await loadRazorpayCheckout();
      if (!window.Razorpay)
        throw new Error("Razorpay Checkout is unavailable. Your bag is unchanged.");
      const checkout = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: "Bhasi Gift Studio",
        description: `Order ${created.order_number}`,
        order_id: payment.orderId,
        prefill: { name: address.fullName, contact: address.phone },
        theme: { color: "#c91d4a" },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            setError("Payment was not completed. Your bag is unchanged; you can retry checkout.");
          },
        },
        handler: (response) => {
          void verifyRazorpayPayment({
            orderId: created.id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          })
            .then((verified) => {
              setOrder(verified);
              setPendingPayment(null);
              clearCart();
            })
            .catch((reason: unknown) => {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Payment verification failed. Contact support before retrying.",
              );
            })
            .finally(() => setSubmitting(false));
        },
      });
      checkout.on("payment.failed", (response) => {
        setError(
          response.error?.description || "Payment failed. Your bag is unchanged; you can retry.",
        );
        setSubmitting(false);
      });
      awaitingPayment = true;
      checkout.open();
    } catch (reason) {
      awaitingPayment = false;
      setSubmitting(false);
      setError(
        reason instanceof Error
          ? reason.message
          : "Order could not be placed. Your bag is unchanged.",
      );
    } finally {
      if (!awaitingPayment) setSubmitting(false);
    }
  }

  if (!ready || addressLoading)
    return (
      <div className="empty-state" role="status">
        <LoaderCircle className="mx-auto animate-spin" /> Loading checkout…
      </div>
    );

  if (order)
    return (
      <div className="container section">
        <div className="empty-state">
          {order.payment_method === "manual_upi_qr" ? (
            <QrCode className="mx-auto text-primary" size={46} />
          ) : (
            <CheckCircle2 className="mx-auto text-primary" size={46} />
          )}
          <span className="eyebrow text-primary">
            {order.payment_method === "manual_upi_qr"
              ? "UPI payment · pending bank verification"
              : order.payment_method === "cash_on_delivery"
                ? "Cash on delivery selected"
                : "Payment confirmed"}
          </span>
          <h1>{order.payment_method === "manual_upi_qr" ? "Order placed." : "Order confirmed."}</h1>
          <p>
            {order.payment_method === "manual_upi_qr" ? (
              <>
                Order <strong>{order.order_number}</strong> is saved and awaiting payment. Scan the
                merchant QR, pay the exact amount, then submit the UPI transaction reference below.
                We will verify payment in our bank before processing the order.
              </>
            ) : order.payment_method === "cash_on_delivery" ? (
              <>
                Order <strong>{order.order_number}</strong> is confirmed. Pay when your gifts are
                delivered.
              </>
            ) : (
              <>
                Payment for order <strong>{order.order_number}</strong> was verified by the server.
              </>
            )}
          </p>
          <p className="font-semibold">
            Total: {formatMoney(Number(order.total_amount), order.currency || currencyCode)}
          </p>
          {order.payment_method === "manual_upi_qr" && (
            <div className="mt-5 grid w-full max-w-md justify-items-center gap-4 rounded-xl border bg-white p-5 text-left">
              <img
                src={availableMethods.upiQrImageUrl}
                alt="Merchant UPI payment QR code"
                className="h-56 w-56 rounded-lg border bg-white object-contain"
              />
              <p className="text-sm">
                Pay to UPI ID:{" "}
                <strong className="select-all">{availableMethods.merchantUpiId}</strong>
              </p>
              <a
                className="text-sm font-semibold text-primary underline"
                href={`upi://pay?pa=${encodeURIComponent(availableMethods.merchantUpiId)}&am=${encodeURIComponent(Number(order.total_amount).toFixed(2))}&cu=${encodeURIComponent(order.currency || currencyCode)}&tn=${encodeURIComponent(`Order ${order.order_number}`)}`}
              >
                Open a UPI app on this device
              </a>
              {referenceSubmitted ? (
                <p
                  role="status"
                  className="w-full rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                  Your UPI reference was submitted. The order remains unpaid until an admin verifies
                  the transfer.
                </p>
              ) : (
                <form
                  className="grid w-full gap-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setSubmittingReference(true);
                    setError("");
                    try {
                      await submitManualPaymentReference({
                        orderId: order.id,
                        reference: paymentReference,
                      });
                      setReferenceSubmitted(true);
                    } catch (reason) {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "Could not submit payment reference.",
                      );
                    } finally {
                      setSubmittingReference(false);
                    }
                  }}
                >
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <label className="grid gap-1 text-sm font-medium">
                    UPI transaction reference / UTR
                    <input
                      className="rounded-lg border px-3 py-2.5 font-normal"
                      required
                      minLength={8}
                      maxLength={100}
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                      placeholder="Enter the transaction ID from your UPI app"
                    />
                  </label>
                  <Button type="submit" disabled={submittingReference}>
                    {submittingReference ? "Submitting…" : "I’ve paid · Submit reference"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Only submit after your payment app shows the transfer as successful.
                  </p>
                </form>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/orders">View my orders</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/products" search={{}}>
                Continue shopping
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );

  if (!cart.length)
    return (
      <div className="empty-state">
        <ShoppingBag size={40} />
        <h2>Your bag is empty.</h2>
        <p>Add a gift before checkout.</p>
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
          <span className="eyebrow text-primary">Checkout · Choose how to pay</span>
          <h1>Delivery details.</h1>
          <p>
            Enter your delivery details and choose a payment method. Online payment is confirmed
            only after server verification.
          </p>
        </div>
      </section>
      <div className="container checkout-steps" aria-label="Checkout progress">
        <span className="checkout-step-active">
          <b>1</b> Delivery details
        </span>
        <i />
        <span className="checkout-step-active">
          <b>2</b> Payment
        </span>
        <i />
        <span>
          <b>3</b> Confirmation
        </span>
      </div>
      <div className="container checkout-layout">
        <form className="auth-form mt-0" onSubmit={(event) => void submit(event)}>
          {!signedIn && (
            <div className="status-notice" role="alert">
              Please{" "}
              <Link className="text-primary underline" to="/login">
                sign in
              </Link>{" "}
              to place this order. Your bag will be kept.
            </div>
          )}
          {!designsReady && (
            <div className="status-notice" role="status">
              Checking your saved designs…
            </div>
          )}
          {localDesigns.length > 0 && (
            <div className="status-notice" role="status">
              <strong>
                {localDesigns.length} browser-only design{localDesigns.length === 1 ? "" : "s"} in
                your bag.
              </strong>
              <p className="mt-1">
                Save them to your account so their editable text and private artwork can be attached
                to the order. Your browser copies will remain saved.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={!signedIn || syncingDesigns}
                onClick={() => void syncLocalDesigns()}
              >
                {syncingDesigns ? "Saving designs…" : "Save designs to account"}
              </Button>
            </div>
          )}
          {notice && (
            <div className="status-notice" role="status">
              {notice}
            </div>
          )}
          {error && (
            <div className="status-notice" role="alert">
              {error}
            </div>
          )}
          <section className="checkout-panel">
            <h2>1. Delivery address</h2>
            {(
              [
                ["fullName", "Recipient name", "text"],
                ["phone", "Phone number (required for WhatsApp updates)", "tel"],
                ["addressLine1", "Address line 1", "text"],
                ["addressLine2", "Address line 2 (optional)", "text"],
                ["city", "City", "text"],
                ["state", "State", "text"],
                ["postalCode", "Postal code", "text"],
                ["country", "Country", "text"],
              ] as const
            ).map(([key, label, type]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type={type}
                  disabled={Boolean(pendingPayment)}
                  autoComplete={key === "fullName" ? "name" : key === "phone" ? "tel" : undefined}
                  maxLength={
                    key === "addressLine1" || key === "addressLine2"
                      ? 200
                      : key === "fullName"
                        ? 100
                        : 100
                  }
                  required={!(["addressLine2"] as string[]).includes(key)}
                  value={address[key]}
                  onChange={(event) =>
                    setAddress((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
            <p className="col-span-full text-xs leading-6 text-muted-foreground">
              We’ll use this number to contact you on WhatsApp about your order artwork or any
              changes needed before printing.
            </p>
          </section>
          <section className="checkout-panel payment-method-panel">
            <h2>2. Payment method</h2>
            <div className="payment-method-options">
              <label
                className={`payment-method-option ${paymentMethod === "razorpay" ? "payment-method-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="razorpay"
                  checked={paymentMethod === "razorpay"}
                  disabled={!availableMethods.razorpay || Boolean(pendingPayment)}
                  onChange={() => setPaymentMethod("razorpay")}
                />
                <span>
                  <strong>Online payment</strong>
                  <small>
                    UPI, credit/debit cards, net banking and supported wallets via Razorpay
                  </small>
                </span>
              </label>
              {!availableMethods.razorpay && (
                <p className="text-xs text-muted-foreground">
                  Online payment is unavailable until Razorpay test keys are configured on the
                  server.
                </p>
              )}
              <label
                className={`payment-method-option ${paymentMethod === "cash_on_delivery" ? "payment-method-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash_on_delivery"
                  checked={paymentMethod === "cash_on_delivery"}
                  disabled={!availableMethods.cashOnDelivery || Boolean(pendingPayment)}
                  onChange={() => setPaymentMethod("cash_on_delivery")}
                />
                <span>
                  <strong>Cash on delivery</strong>
                  <small>Pay the delivery partner when your order arrives</small>
                </span>
              </label>
              {availableMethods.manualUpiQr && (
                <label
                  className={`payment-method-option ${paymentMethod === "manual_upi_qr" ? "payment-method-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="manual_upi_qr"
                    checked={paymentMethod === "manual_upi_qr"}
                    disabled={Boolean(pendingPayment)}
                    onChange={() => setPaymentMethod("manual_upi_qr")}
                  />
                  <span>
                    <strong>Pay by UPI QR</strong>
                    <small>
                      Scan and pay, then submit your UPI transaction reference. Payment is verified
                      manually.
                    </small>
                  </span>
                </label>
              )}
            </div>
            {paymentMethod === "razorpay" && (
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Razorpay Checkout will show payment modes enabled for this account. Your bag clears
                only after the server verifies payment.
              </p>
            )}
          </section>
          <Button
            type="submit"
            size="lg"
            disabled={submitting || !signedIn || !designsReady || localDesigns.length > 0}
          >
            {submitting ? (
              <>
                <LoaderCircle className="animate-spin" /> Placing order…
              </>
            ) : paymentMethod === "cash_on_delivery" ? (
              "Place order · Cash on delivery"
            ) : paymentMethod === "manual_upi_qr" ? (
              "Place order · Pay by UPI QR"
            ) : (
              "Continue to online payment"
            )}
          </Button>
          <Button type="button" variant="link" asChild className="justify-self-start">
            <Link to="/cart">
              <ArrowLeft /> Back to your bag
            </Link>
          </Button>
        </form>
        <aside className="checkout-panel checkout-summary-panel">
          <h2>
            Order summary{" "}
            <span className="checkout-item-count">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} items
            </span>
          </h2>
          <div className="checkout-list">
            {lines.map(({ item, product }) => (
              <div key={item.key}>
                <span>
                  {product?.name || "Unavailable product"}
                  <span className="block mt-1 text-xs text-muted-foreground">
                    {item.variant} · Qty {item.quantity}
                    {item.designId ? " · Personalized" : ""}
                  </span>
                </span>
                <span>
                  {product ? formatMoney(product.price * item.quantity, product.currencyCode) : "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between font-semibold">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal, currencyCode)}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm text-muted-foreground">
            <span>Shipping</span>
            <span>Not configured</span>
          </div>
          <div className="mt-2 flex justify-between text-sm text-muted-foreground">
            <span>Tax</span>
            <span>Not configured</span>
          </div>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            The backend calculates the final subtotal using current product prices. Your displayed
            estimate is informational.
          </p>
        </aside>
      </div>
    </>
  );
}
