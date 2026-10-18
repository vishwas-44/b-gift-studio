const express = require("express");
const supabase = require("../supabase");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, name, slug, description, price, currency, image_url, stock_quantity, is_active, variants",
      )
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

module.exports = router;
