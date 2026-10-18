const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

// Every endpoint requires a verified administrator.
router.use(requireAdmin);

// GET /api/admin/customers?page=1&limit=20&search=
router.get("/", async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Page must be positive and limit must be between 1 and 100.",
      });
    }

    if (search.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Search value is too long.",
      });
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, created_at, role", {
        count: "exact",
      })
      .neq("role", "admin")
      .order("created_at", { ascending: false })
      .range(from, to);

    // Remove PostgREST filter syntax characters from user input.
    const safeSearch = search.replace(/[\\%_(),."]/g, "").trim();

    if (safeSearch) {
      query = query.or(`full_name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`);
    }

    const { data: customers, error, count } = await query;

    if (error) {
      console.error("Admin customer list query failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to load customers.",
      });
    }

    const rows = customers || [];
    const customerIds = rows.map((customer) => customer.id);
    const orderCounts = new Map();

    if (customerIds.length > 0) {
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from("orders")
        .select("user_id")
        .in("user_id", customerIds);

      if (ordersError) {
        console.error("Admin customer order count query failed:", ordersError.message);
        return res.status(500).json({
          success: false,
          message: "Unable to load customer order counts.",
        });
      }

      for (const order of orders || []) {
        if (order.user_id) {
          orderCounts.set(order.user_id, (orderCounts.get(order.user_id) || 0) + 1);
        }
      }
    }

    const total = count || 0;

    return res.status(200).json({
      success: true,
      customers: rows.map((customer) => ({
        id: customer.id,
        full_name: customer.full_name,
        phone: customer.phone,
        created_at: customer.created_at,
        order_count: orderCounts.get(customer.id) || 0,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
