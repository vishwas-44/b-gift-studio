const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();
const FEEDBACK_STATUSES = new Set(["new", "reviewed", "resolved"]);

router.use(requireAdmin);

router.get("/", async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const status = typeof req.query.status === "string" ? req.query.status : "";

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({ success: false, message: "Invalid feedback pagination." });
    }
    if (status && !FEEDBACK_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: "Invalid feedback status." });
    }

    const from = (page - 1) * limit;
    let query = supabaseAdmin
      .from("customer_feedback")
      .select("id, user_id, category, rating, message, status, created_at, updated_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);
    if (status) query = query.eq("status", status);

    const { data: rows, error, count } = await query;
    if (error) return next(error);

    const userIds = [...new Set((rows || []).map((row) => row.user_id))];
    let profilesById = new Map();
    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", userIds);
      if (profileError) return next(profileError);
      profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    }

    const total = count || 0;
    return res.json({
      success: true,
      feedback: (rows || []).map((row) => ({
        ...row,
        customer: profilesById.get(row.user_id) || null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ success: false, message: "Invalid feedback ID." });
    }
    if (!FEEDBACK_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: "Choose a valid feedback status." });
    }

    const { data, error } = await supabaseAdmin
      .from("customer_feedback")
      .update({
        status,
        reviewed_by: status === "new" ? null : req.user.id,
        reviewed_at: status === "new" ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, status, reviewed_at, updated_at")
      .maybeSingle();
    if (error) return next(error);
    if (!data) return res.status(404).json({ success: false, message: "Feedback was not found." });
    return res.json({ success: true, feedback: data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
