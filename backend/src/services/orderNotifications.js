const supabaseAdmin = require("../supabaseAdmin");
const { sendEmail } = require("./mailer");
const { isOfficialTrackingUrl } = require("./shipmentValidation");

const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function money(value, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function productSummary(items = []) {
  return (
    items.map((item) => `${item.product_name} · ${item.variant} × ${item.quantity}`).join(", ") ||
    "Your order"
  );
}

function emailMarkup(title, rows, order) {
  const body = rows
    .map(([label, value]) => {
      const trackLink =
        label === "Track shipment" && isOfficialTrackingUrl(value, order.courier_company)
          ? `<a href="${escapeHtml(value)}" rel="noopener noreferrer">Open courier tracking</a>`
          : escapeHtml(value);
      return `<tr><td style="padding:8px;color:#766b63">${escapeHtml(label)}</td><td style="padding:8px;color:#302722">${trackLink}</td></tr>`;
    })
    .join("");
  const link = `${frontendUrl}/orders`;
  return {
    html: `<div style="margin:0;background:#faf7f4;padding:28px;font-family:Arial,sans-serif;color:#302722"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #eee4de;border-radius:16px;padding:28px"><p style="color:#bd5c61;font-weight:bold;letter-spacing:1px">BHASI GIFT STUDIO</p><h1 style="font-size:23px">${escapeHtml(title)}</h1><table style="width:100%;border-collapse:collapse">${body}</table><p style="margin-top:24px"><a href="${escapeHtml(link)}" style="background:#bd5c61;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">View my orders</a></p><p style="font-size:12px;color:#766b63">Order ${escapeHtml(order.order_number)}</p></div></div>`,
    text: `${title}\nBhasi Gift Studio\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\nMy orders: ${link}`,
  };
}

async function loadOrder(orderId) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  const [{ data: items, error: itemError }, { data: userData, error: userError }] =
    await Promise.all([
      supabaseAdmin
        .from("order_items")
        .select("product_name, variant, quantity, unit_price")
        .eq("order_id", orderId)
        .order("created_at"),
      supabaseAdmin.auth.admin.getUserById(order.user_id),
    ]);
  if (itemError) throw itemError;
  if (userError) throw userError;
  return { ...order, items: items || [], customer_email: userData.user?.email || null };
}

function notificationFor(type, order) {
  const products = productSummary(order.items);
  const rows = [
    ["Order number", order.order_number],
    ["Order date", formatDate(order.created_at)],
    ["Products", products],
    ["Status", order.status],
  ];
  if (type === "order_confirmation") {
    order.items.forEach((item, index) => {
      rows.push([
        `Product ${index + 1}`,
        `${item.product_name} · ${item.variant} × ${item.quantity} · ${money(item.unit_price, order.currency)} each`,
      ]);
    });
    rows.push(
      ["Subtotal", money(order.subtotal, order.currency)],
      ["Shipping", money(order.shipping_fee, order.currency)],
      ["Tax", money(order.tax_amount, order.currency)],
      ["Total", money(order.total_amount, order.currency)],
    );
    const address = order.shipping_address || {};
    rows.push([
      "Delivery address",
      [
        address.fullName,
        address.addressLine1,
        address.addressLine2,
        address.city,
        address.state,
        address.postalCode,
        address.country,
      ]
        .filter(Boolean)
        .join(", "),
    ]);
    return {
      subject: `Order ${order.order_number} confirmed · Bhasi Gift Studio`,
      title: "Thank you for your order",
      rows,
    };
  }
  if (type === "processing")
    return {
      subject: "Your Bhasi Gift Studio order is being prepared",
      title: "Your order is being prepared",
      rows,
    };
  if (type === "cancelled") {
    rows.unshift(["Update", "We’re sorry, but your order has been cancelled."]);
    if (order.cancellation_reason) rows.push(["Reason", order.cancellation_reason]);
    return {
      subject: "Update regarding your Bhasi Gift Studio order",
      title: "Order cancelled",
      rows,
    };
  }
  if (type === "shipped") {
    const courier =
      order.courier_company === "Other" ? order.custom_courier_name : order.courier_company;
    rows.push(
      ["Courier", courier],
      ["Tracking ID", order.tracking_id],
      ["Handover date", order.shipment_date],
      ["Track shipment", order.tracking_url],
    );
    return {
      subject: "Your Bhasi Gift Studio order has been shipped",
      title: "Your order is on its way",
      rows,
    };
  }
  return null;
}

async function sendOrderNotification(orderId, type, eventKey = `${orderId}:${type}`) {
  let order;
  try {
    order = await loadOrder(orderId);
  } catch (error) {
    console.error("Could not load order notification details:", error.message);
    return { status: "failed" };
  }
  if (!order.customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customer_email))
    return { status: "skipped" };
  const message = notificationFor(type, order);
  if (!message) return { status: "skipped" };
  const { data: event, error: insertError } = await supabaseAdmin
    .from("order_notification_events")
    .insert({
      order_id: orderId,
      event_key: eventKey,
      notification_type: type,
      recipient_email: order.customer_email,
      delivery_status: "pending",
    })
    .select("id")
    .single();
  if (insertError?.code === "23505") return { status: "duplicate" };
  if (insertError) {
    console.error("Could not record order notification:", insertError.message);
    return { status: "failed" };
  }
  const attempt = await supabaseAdmin
    .from("order_notification_events")
    .update({ attempt_count: 1 })
    .eq("id", event.id);
  if (attempt.error) console.error("Could not record notification attempt:", attempt.error.message);
  try {
    const formatted = emailMarkup(message.title, message.rows, order);

    const result = await sendEmail({
      to: order.customer_email,
      subject: message.subject,
      text: formatted.text,
      html: formatted.html,
    });
    await supabaseAdmin
      .from("order_notification_events")
      .update({
        delivery_status: "accepted",
        provider_message_id: result.messageId || null,
        error_detail: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    return { status: "accepted" };
  } catch (error) {
    await supabaseAdmin
      .from("order_notification_events")
      .update({
        delivery_status: "failed",
        error_detail: String(error.message).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    return { status: "failed" };
  }
}

async function retryNotification(eventId) {
  const { data: event, error } = await supabaseAdmin
    .from("order_notification_events")
    .select("id, order_id, event_key, notification_type, delivery_status, attempt_count")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  if (event.delivery_status === "accepted") return { status: "accepted" };
  const claim = await supabaseAdmin
    .from("order_notification_events")
    .update({
      delivery_status: "pending",
      attempt_count: event.attempt_count + 1,
      error_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", event.id)
    .eq("delivery_status", "failed")
    .select("id")
    .maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return { status: "pending" };
  const order = await loadOrder(event.order_id);
  const message = notificationFor(event.notification_type, order);
  if (!message || !order.customer_email) return { status: "failed" };
  try {
    const formatted = emailMarkup(message.title, message.rows, order);

    const result = await sendEmail({
      to: order.customer_email,
      subject: message.subject,
      text: formatted.text,
      html: formatted.html,
    });
    await supabaseAdmin
      .from("order_notification_events")
      .update({
        delivery_status: "accepted",
        provider_message_id: result.messageId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    return { status: "accepted" };
  } catch (sendError) {
    await supabaseAdmin
      .from("order_notification_events")
      .update({
        delivery_status: "failed",
        error_detail: String(sendError.message).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    return { status: "failed" };
  }
}

module.exports = { sendOrderNotification, retryNotification };
