const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const requireAdmin = require("../middleware/requireAdmin");
const { toCsv } = require("../services/csvExport");

const router = express.Router();
const MAX_REPORT_ORDERS = 20000;
router.use(requireAdmin);

function period(req) {
  const preset = typeof req.query.range === "string" ? req.query.range : "30d";
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (preset === "custom") {
    const start = new Date(`${req.query.start}T00:00:00.000Z`);
    const end = new Date(`${req.query.end}T00:00:00.000Z`);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end)
      throw new Error("Provide a valid custom date range.");
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${req.query.start} to ${req.query.end}`,
    };
  }
  let start = new Date(today);
  if (preset === "today") start = today;
  else if (preset === "7d") start.setUTCDate(start.getUTCDate() - 6);
  else if (preset === "30d") start.setUTCDate(start.getUTCDate() - 29);
  else if (preset === "month")
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  else if (preset === "previous_month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    return {
      start: start.toISOString(),
      end: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString(),
      label: "Previous month",
    };
  } else throw new Error("Choose a valid reporting period.");
  return {
    start: start.toISOString(),
    end: new Date(today.getTime() + 86400000).toISOString(),
    label: preset,
  };
}

async function summaryFor(range) {
  const { count, error: countError } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", range.start)
    .lt("created_at", range.end);
  if (countError) throw countError;
  if ((count || 0) > MAX_REPORT_ORDERS)
    throw new Error("Too many orders for this report. Choose a shorter period.");
  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select("id, status, payment_status, payment_method, total_amount, created_at")
    .gte("created_at", range.start)
    .lt("created_at", range.end)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = orders || [];
  const statuses = Object.fromEntries(
    ["pending", "processing", "shipped", "delivered", "cancelled"].map((key) => [key, 0]),
  );
  const payments = { paid: 0, unpaid: 0 };
  let orderValue = 0,
    collectedPayments = 0,
    unpaidCodValue = 0;
  const trend = new Map();
  for (const order of rows) {
    statuses[order.status] = (statuses[order.status] || 0) + 1;
    const value = Number(order.total_amount) || 0;
    orderValue += value;
    payments[order.payment_status] = (payments[order.payment_status] || 0) + 1;
    if (order.payment_status === "paid") collectedPayments += value;
    if (order.payment_method === "cash_on_delivery" && order.payment_status === "unpaid")
      unpaidCodValue += value;
    const day = order.created_at.slice(0, 10);
    const entry = trend.get(day) || { date: day, orders: 0, collected: 0 };
    entry.orders += 1;
    if (order.payment_status === "paid") entry.collected += value;
    trend.set(day, entry);
  }
  return {
    period: range,
    orders: rows.length,
    statuses,
    payments,
    order_value: orderValue,
    collected_payments: collectedPayments,
    unpaid_cod_value: unpaidCodValue,
    trend: [...trend.values()],
  };
}

router.get("/summary", async (req, res, next) => {
  try {
    return res.json({ success: true, summary: await summaryFor(period(req)) });
  } catch (error) {
    return error.message?.startsWith("Choose") ||
      error.message?.startsWith("Provide") ||
      error.message?.startsWith("Too many")
      ? res.status(400).json({ success: false, message: error.message })
      : next(error);
  }
});

router.get("/financial-export", async (req, res, next) => {
  try {
    const summary = await summaryFor(period(req));
    const csv = toCsv(
      [
        "Reporting Period",
        "Orders Created",
        "Order Value",
        "Collected Payments",
        "Unpaid COD Value",
        "Paid Orders",
        "Unpaid Orders",
      ],
      [
        [
          summary.period.label,
          summary.orders,
          summary.order_value,
          summary.collected_payments,
          summary.unpaid_cod_value,
          summary.payments.paid || 0,
          summary.payments.unpaid || 0,
        ],
      ],
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bhasi-financial-summary-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});
module.exports = router;
