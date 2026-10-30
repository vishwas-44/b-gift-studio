const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Every endpoint in this router requires administrator access.
router.use(requireAdmin);

// GET /api/admin/products
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, slug, description, price, currency, image_url, stock_quantity, is_active")
      .order("name", { ascending: true });

    if (error) {
      console.error("Admin product query failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to load products.",
      });
    }

    return res.status(200).json({
      success: true,
      count: data.length,
      products: data,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/products/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
    }

    const body = req.body || {};
    const allowedFields = ["price", "stock_quantity", "is_active"];
    const suppliedFields = Object.keys(body);

    if (
      suppliedFields.length === 0 ||
      suppliedFields.some((field) => !allowedFields.includes(field))
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide only price, stock_quantity, or is_active to update.",
      });
    }

    const updates = {};

    if (Object.hasOwn(body, "price")) {
      if (
        typeof body.price !== "number" ||
        !Number.isFinite(body.price) ||
        body.price <= 0 ||
        body.price > 10000000
      ) {
        return res.status(400).json({
          success: false,
          message: "Price must be a number greater than zero.",
        });
      }

      updates.price = body.price;
    }

    if (Object.hasOwn(body, "stock_quantity")) {
      if (
        !Number.isSafeInteger(body.stock_quantity) ||
        body.stock_quantity < 0 ||
        body.stock_quantity > 10000000
      ) {
        return res.status(400).json({
          success: false,
          message: "Stock must be a non-negative whole number.",
        });
      }

      updates.stock_quantity = body.stock_quantity;
    }

    if (Object.hasOwn(body, "is_active")) {
      if (typeof body.is_active !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false.",
        });
      }

      updates.is_active = body.is_active;
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(updates)
      .eq("id", id)
      .select("id, name, slug, description, price, currency, image_url, stock_quantity, is_active")
      .maybeSingle();

    if (error) {
      console.error("Admin product update failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to update product.",
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      product: data,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
