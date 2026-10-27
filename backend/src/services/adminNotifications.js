const { sendEmail } = require("./mailer");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notificationRecipient() {
  const recipient = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  return recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ? recipient : null;
}

function adminUrl(path) {
  const origin = process.env.FRONTEND_URL || "http://localhost:8080";
  return `${origin.replace(/\/$/, "")}${path}`;
}

function addressText(address) {
  return [
    address?.fullName,
    address?.phone,
    address?.addressLine1,
    address?.addressLine2,
    address?.city,
    address?.state,
    address?.postalCode,
    address?.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function money(value, currency = "INR") {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${currency} ${amount.toFixed(2)}` : "Not recorded";
}

async function sendAdminNotification(message) {
  const to = notificationRecipient();
  if (!to) {
    console.warn("Admin notification skipped: ADMIN_NOTIFICATION_EMAIL is not configured.");
    return { sent: false, reason: "not_configured" };
  }
  try {
    await sendEmail({ to, ...message });
    return { sent: true };
  } catch (error) {
    // Do not include order, feedback, address, or message content in logs.
    console.error("Admin notification delivery failed:", error.message);
    return { sent: false, reason: "delivery_failed" };
  }
}

async function notifyNewOrder({ order, customerEmail, items }) {
  const address = order.shipping_address || {};
  const rows = (items || [])
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.product_name)}</td><td>${escapeHtml(item.variant)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(money(Number(item.unit_price) * item.quantity, order.currency))}</td></tr>`,
    )
    .join("");
  const detailsUrl = adminUrl("/admin/orders");
  return sendAdminNotification({
    subject: `New order ${order.order_number} — Bhasi Gift Studio`,
    text: `New order ${order.order_number}\nCreated: ${order.created_at}\nCustomer: ${address.fullName || "Not recorded"}\nEmail: ${customerEmail || "Not recorded"}\nPhone: ${address.phone || "Not recorded"}\nAddress: ${addressText(address) || "Not recorded"}\nTotal: ${money(order.total_amount, order.currency)}\nPayment: ${order.payment_method} (${order.payment_status})\nStatus: ${order.status}\nReview: ${detailsUrl}`,
    html: `<div style="font-family:Arial,sans-serif;color:#292524;max-width:640px;margin:auto"><div style="background:#c91d4a;color:white;padding:20px 24px"><strong>BHASI GIFT STUDIO</strong><h1 style="margin:8px 0 0;font-size:24px">New order received</h1></div><div style="padding:24px;border:1px solid #e7e5e4"><p><strong>${escapeHtml(order.order_number)}</strong> was created on ${escapeHtml(order.created_at)}.</p><h2 style="font-size:16px">Customer & delivery</h2><p>${escapeHtml(address.fullName || "Not recorded")}<br>${escapeHtml(customerEmail || "Not recorded")}<br>${escapeHtml(addressText(address) || "Not recorded")}</p><h2 style="font-size:16px">Items</h2><table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Product</th><th align="left">Variant</th><th align="left">Qty</th><th align="right">Line total</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No item details were returned.</td></tr>'}</tbody></table><p><strong>Total:</strong> ${escapeHtml(money(order.total_amount, order.currency))}<br><strong>Payment:</strong> ${escapeHtml(order.payment_method)} (${escapeHtml(order.payment_status)})<br><strong>Order status:</strong> ${escapeHtml(order.status)}</p><p><a href="${escapeHtml(detailsUrl)}" style="color:#c91d4a;font-weight:bold">Review order in admin</a></p></div></div>`,
  });
}

async function notifyNewFeedback({ feedback, customerName, customerEmail }) {
  const feedbackUrl = adminUrl("/admin/feedback");
  return sendAdminNotification({
    subject: `New customer feedback — Bhasi Gift Studio`,
    text: `New feedback ${feedback.id}\nSubmitted: ${feedback.created_at}\nCustomer: ${customerName || "Not recorded"}\nEmail: ${customerEmail || "Not recorded"}\nCategory: ${feedback.category}\nRating: ${feedback.rating}/5\nStatus: ${feedback.status}\nMessage: ${feedback.message}\nReview: ${feedbackUrl}`,
    html: `<div style="font-family:Arial,sans-serif;color:#292524;max-width:640px;margin:auto"><div style="background:#c91d4a;color:white;padding:20px 24px"><strong>BHASI GIFT STUDIO</strong><h1 style="margin:8px 0 0;font-size:24px">New customer feedback</h1></div><div style="padding:24px;border:1px solid #e7e5e4"><p><strong>Customer:</strong> ${escapeHtml(customerName || "Not recorded")}<br><strong>Email:</strong> ${escapeHtml(customerEmail || "Not recorded")}<br><strong>Category:</strong> ${escapeHtml(feedback.category)}<br><strong>Rating:</strong> ${escapeHtml(feedback.rating)}/5<br><strong>Status:</strong> ${escapeHtml(feedback.status)}</p><blockquote style="margin:16px 0;padding:14px;border-left:4px solid #c91d4a;background:#fff1f2;white-space:pre-wrap">${escapeHtml(feedback.message)}</blockquote><p><a href="${escapeHtml(feedbackUrl)}" style="color:#c91d4a;font-weight:bold">Review feedback in admin</a></p></div></div>`,
  });
}

module.exports = { escapeHtml, notifyNewFeedback, notifyNewOrder };
