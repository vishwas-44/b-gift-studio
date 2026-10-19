export const WHATSAPP_NUMBER = "919035127328";

export function orderWhatsAppUrl(order: {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total_amount: number | string;
  currency: string;
  items?: Array<{ product_name: string; variant: string; quantity: number }>;
}) {
  if (!order.id || !order.order_number) return null;
  const date = new Date(order.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const products = (order.items || [])
    .map((item) => `${item.product_name} (${item.variant}) × ${item.quantity}`)
    .join(", ");
  const total = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: order.currency || "INR",
  }).format(Number(order.total_amount));
  const message = `Hello Bhasi Gift Studio! I have placed an order.\n\nOrder ID: ${order.order_number}\nOrder Date: ${date}\nProducts: ${products || "Please see order details"}\nOrder Total: ${total}\nOrder Status: ${order.status}\n\nPlease confirm my order and let me know if any additional information is required.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
