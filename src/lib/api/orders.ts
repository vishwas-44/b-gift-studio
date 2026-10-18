const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const SESSION_KEY = "bhasi-auth-session";

export type DeliveryAddress = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type CheckoutItem = {
  productId: string;
  variant: string;
  quantity: number;
  designId?: string;
};

export type CreatedOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number | string;
  shipping_fee: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  currency: string;
  created_at: string;
  manual_payment_reference?: string | null;
  manual_payment_reference_submitted_at?: string | null;
  payment_verified_at?: string | null;
};

function token(): string {
  let session: { access_token?: unknown };
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    throw new Error("Your saved sign-in session is invalid. Please sign in again.");
  }
  if (typeof session?.access_token !== "string" || !session.access_token) {
    throw new Error("Sign in to place an order.");
  }
  return session.access_token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(
      typeof payload?.message === "string"
        ? payload.message
        : `Checkout request failed (HTTP ${response.status}).`,
    );
  }
  return payload as T;
}

export async function getSavedDeliveryAddress(): Promise<DeliveryAddress | null> {
  const result = await request<{ address: DeliveryAddress | null }>("/api/orders/address");
  return result.address;
}

export async function createOrder(input: {
  items: CheckoutItem[];
  shippingAddress: DeliveryAddress;
}): Promise<CreatedOrder> {
  const result = await request<{ order: CreatedOrder }>("/api/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!result.order?.id || !result.order.order_number || result.order.payment_status !== "unpaid") {
    throw new Error("The server response did not confirm an unpaid order. Your bag was kept.");
  }
  return result.order;
}

export type RazorpayPaymentOrder = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
};

export async function getCheckoutPaymentMethods(): Promise<{
  razorpay: boolean;
  cashOnDelivery: boolean;
  manualUpiQr: boolean;
  upiQrImageUrl: string;
  merchantUpiId: string;
}> {
  const result = await request<{
    paymentMethods: {
      razorpay: boolean;
      cashOnDelivery: boolean;
      manualUpiQr: boolean;
      upiQrImageUrl: string;
      merchantUpiId: string;
    };
  }>("/api/orders/payment-methods");
  return result.paymentMethods;
}

export async function createManualUpiQrOrder(input: {
  items: CheckoutItem[];
  shippingAddress: DeliveryAddress;
}): Promise<CreatedOrder> {
  const result = await request<{ order: CreatedOrder }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({ ...input, paymentProvider: "manual_upi_qr" }),
  });
  if (
    !result.order?.id ||
    result.order.payment_status !== "unpaid" ||
    result.order.payment_method !== "manual_upi_qr"
  ) {
    throw new Error("The server did not confirm a pending UPI QR order. Your bag was kept.");
  }
  return result.order;
}

export async function submitManualPaymentReference(input: {
  orderId: string;
  reference: string;
}): Promise<void> {
  await request("/api/orders/upi-qr/reference", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createCashOnDeliveryOrder(input: {
  items: CheckoutItem[];
  shippingAddress: DeliveryAddress;
}): Promise<CreatedOrder> {
  const result = await request<{ order: CreatedOrder }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({ ...input, paymentProvider: "cash_on_delivery" }),
  });
  if (
    !result.order?.id ||
    result.order.payment_status !== "unpaid" ||
    result.order.payment_method !== "cash_on_delivery"
  ) {
    throw new Error("The server did not confirm a cash on delivery order. Your bag was kept.");
  }
  return result.order;
}

export async function createRazorpayOrder(input: {
  items: CheckoutItem[];
  shippingAddress: DeliveryAddress;
}): Promise<{ order: CreatedOrder; payment: RazorpayPaymentOrder }> {
  const result = await request<{ order: CreatedOrder; payment: RazorpayPaymentOrder }>(
    "/api/orders",
    {
      method: "POST",
      body: JSON.stringify({ ...input, paymentProvider: "razorpay" }),
    },
  );
  if (
    !result.order?.id ||
    result.order.payment_status !== "unpaid" ||
    result.order.payment_method !== "razorpay" ||
    !result.payment?.orderId ||
    !result.payment.keyId ||
    !result.payment.amount
  ) {
    throw new Error("The server did not return a valid Razorpay payment order. Your bag was kept.");
  }
  return result;
}

export async function verifyRazorpayPayment(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<CreatedOrder> {
  const result = await request<{ order: CreatedOrder }>("/api/orders/razorpay/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!result.order?.id || result.order.payment_status !== "paid") {
    throw new Error("Payment could not be confirmed by the server. Your bag was kept.");
  }
  return result.order;
}

export type OrderHistoryRow = CreatedOrder & {
  courier_company: string | null;
  custom_courier_name: string | null;
  tracking_id: string | null;
  shipment_date: string | null;
  tracking_url: string | null;
  courier_charge: number | string;
  courier_charge_paid_by: "admin" | "customer";
  courier_charge_payment_status: "paid" | "unpaid";
  shipment_created_at: string | null;
  shipment_updated_at: string | null;
  items: Array<{
    id: string;
    product_name: string;
    variant: string;
    quantity: number;
    unit_price: number | string;
    customization_snapshot: Record<string, unknown> | null;
  }>;
};

export async function listMyOrders(): Promise<OrderHistoryRow[]> {
  const result = await request<{ orders: OrderHistoryRow[] }>("/api/orders/mine");
  return result.orders;
}
