const express = require("express");
const rateLimit = require("express-rate-limit");
const supabaseAdmin = require("../supabaseAdmin");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedEvents = new Set(["page_view", "product_view", "add_to_cart", "checkout_started"]);

router.post(
  "/events",
  rateLimit({ windowMs: 60_000, limit: 45, standardHeaders: "draft-8", legacyHeaders: false }),
  async (req, res, next) => {
    try {
      const { sessionId, eventType, pagePath } = req.body || {};
      const productSlug =
        typeof pagePath === "string" && /^\/products\/[a-z0-9-]{1,120}$/i.test(pagePath)
          ? pagePath.slice("/products/".length)
          : null;
      if (
        !UUID.test(sessionId || "") ||
        !allowedEvents.has(eventType) ||
        typeof pagePath !== "string" ||
        !pagePath.startsWith("/") ||
        pagePath.length > 300 ||
        pagePath.includes("?") ||
        pagePath.includes("#")
      ) {
        return res.status(400).json({ success: false, message: "Invalid analytics event." });
      }
      const { error } = await supabaseAdmin.from("storefront_analytics_events").insert({
        session_id: sessionId,
        event_type: eventType,
        page_path: pagePath,
        product_slug: productSlug,
      });
      if (error) {
        if (["42P01", "PGRST205"].includes(error.code))
          return res
            .status(503)
            .json({ success: false, message: "Analytics migration is not applied." });
        return next(error);
      }
      return res.status(202).json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/summary", requireAdmin, async (req, res, next) => {
  try {
    const days = Number(req.query.days ?? 30);
    if (!Number.isInteger(days) || days < 1 || days > 90)
      return res
        .status(400)
        .json({ success: false, message: "Choose a period from 1 to 90 days." });
    const { data, error } = await supabaseAdmin.rpc("admin_traction_summary", { p_days: days });
    if (error) {
      if (["42883", "PGRST202"].includes(error.code))
        return res.status(503).json({
          success: false,
          message:
            "Traction analytics database setup is incomplete. Apply supabase/migrations/20261018030000_traction_analytics.sql.",
        });
      return next(error);
    }
    return res.json({ success: true, summary: data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
