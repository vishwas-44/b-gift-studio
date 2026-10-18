const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const { verifyWebhookSignature } = require("../services/razorpay");

const router = express.Router();

router.post("/", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, signature)) {
    return res.status(400).json({ success: false, message: "Invalid webhook signature." });
  }
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ success: false, message: "Invalid webhook payload." });
  }
  if (event.event !== "payment.captured") return res.json({ success: true, ignored: true });

  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id || payment.status !== "captured") {
    return res
      .status(400)
      .json({ success: false, message: "Captured payment details are incomplete." });
  }
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, total_amount, currency, payment_status")
    .eq("razorpay_order_id", payment.order_id)
    .maybeSingle();
  if (error)
    return res
      .status(500)
      .json({ success: false, message: "Could not find the storefront order." });
  if (!order) return res.json({ success: true, ignored: true });
  if (
    payment.amount !== Math.round(Number(order.total_amount) * 100) ||
    payment.currency !== order.currency
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Captured payment amount did not match the order." });
  }
  if (order.payment_status === "paid") return res.json({ success: true, alreadyProcessed: true });

  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "paid",
      payment_method: "razorpay",
      razorpay_payment_id: payment.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("payment_status", "unpaid");
  if (updateError)
    return res
      .status(500)
      .json({ success: false, message: "Could not update storefront payment status." });
  return res.json({ success: true });
});

module.exports = router;
