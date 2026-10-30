const express = require("express");
const supabase = require("../supabase");

const router = express.Router();
const PRODUCT_FIELDS =
  "id, name, slug, description, price, currency, image_url, stock_quantity, is_active, variants";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get("/", async (req, res, next) => {
  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Product listing does not accept query parameters.",
    });
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Supabase products query failed:", error);
      return next(error);
    }

    res.status(200).json({
      success: true,
      count: data.length,
      products: data,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Product details do not accept query parameters.",
    });
  }

  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("id", req.params.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("Supabase product query failed:", error);
      return next(error);
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    return res.status(200).json({ success: true, product: data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
