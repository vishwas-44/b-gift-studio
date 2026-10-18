const express = require("express");
const rateLimit = require("express-rate-limit");
const supabaseAdmin = require("../supabaseAdmin");
const requireAuth = require("../middleware/requireAuth");
const { canonicalVariant } = require("../services/productVariants");

const router = express.Router();

router.use(requireAuth);

const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "You have sent several feedback messages. Please try again later.",
  },
});

const feedbackCategories = new Set(["general", "product", "delivery", "website", "support"]);

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function validateDesignBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Provide a design object.";
  }

  const { productId, designName, variant, designData, assetId, assetIds } = body;

  if (!isUuid(productId)) return "Invalid product ID.";
  if (typeof designName !== "string" || !designName.trim() || designName.trim().length > 80) {
    return "Design name must contain 1 to 80 characters.";
  }
  if (typeof variant !== "string" || !variant.trim() || variant.length > 100) {
    return "Invalid product variant.";
  }
  if (!designData || typeof designData !== "object" || Array.isArray(designData)) {
    return "Design data must be an object.";
  }
  if (Buffer.byteLength(JSON.stringify(designData), "utf8") > 100_000) {
    return "Design data is too large.";
  }
  if (Object.prototype.hasOwnProperty.call(designData, "artwork")) {
    return "Store artwork in private Storage, not as a data URL.";
  }
  if (assetId !== undefined && assetId !== null && !isUuid(assetId)) {
    return "Invalid image asset ID.";
  }
  if (
    assetIds !== undefined &&
    (!Array.isArray(assetIds) || assetIds.length > 20 || !assetIds.every(isUuid))
  ) {
    return "Provide at most 20 valid image asset IDs.";
  }

  const texts = designData.texts;
  if (!Array.isArray(texts) || texts.length > 10) {
    return "Design must contain at most 10 text layers.";
  }

  const seen = new Set();

  for (const layer of texts) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      return "Invalid text layer.";
    }
    if (typeof layer.id !== "string" || !layer.id || layer.id.length > 100 || seen.has(layer.id)) {
      return "Text layer IDs must be unique.";
    }
    seen.add(layer.id);

    if (typeof layer.text !== "string" || layer.text.length > 150) {
      return "Text must be 150 characters or fewer.";
    }
    if (typeof layer.color !== "string" || !/^#[0-9a-f]{6}$/i.test(layer.color)) {
      return "Invalid text colour.";
    }
    if (!Number.isFinite(layer.size) || layer.size < 12 || layer.size > 60) {
      return "Text size must be between 12 and 60.";
    }
    if (
      !Number.isFinite(layer.x) ||
      layer.x < 10 ||
      layer.x > 90 ||
      !Number.isFinite(layer.y) ||
      layer.y < 10 ||
      layer.y > 90
    ) {
      return "Text position must be between 10 and 90.";
    }
  }

  if (!assetId && !assetIds?.length && !texts.some((layer) => layer.text.trim())) {
    return "Add an image or some text before saving.";
  }

  return null;
}

async function validateProductAndAsset({ productId, variant, assetId, assetIds = [], userId }) {
  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, is_active, variants")
    .eq("id", productId)
    .maybeSingle();

  if (productError) return { error: productError };
  if (!product || !product.is_active) return { message: "Product not found or unavailable." };

  const canonical = canonicalVariant(product.variants, variant);
  if (!canonical) return { message: `The selected variant for ${product.name} is unavailable.` };

  const allAssetIds = [...new Set([...(assetId ? [assetId] : []), ...assetIds])];
  if (allAssetIds.length) {
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("design_assets")
      .select("id, user_id, design_id, order_item_id, deleted_at")
      .in("id", allAssetIds)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (assetError) return { error: assetError };
    if (!asset || asset.length !== allAssetIds.length || asset.some((row) => row.order_item_id)) {
      return { message: "Image asset not found or unavailable." };
    }
  }

  return { product, variant: canonical };
}

// Get the signed-in customer's saved designs.
router.get("/designs", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("saved_designs")
      .select("id, product_id, design_name, status, created_at, updated_at, design_data, ai_prompt")
      .eq("user_id", req.user.id)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) return next(error);
    return res.json({ success: true, count: data.length, designs: data });
  } catch (error) {
    next(error);
  }
});

// Create a draft design.
router.post("/designs", async (req, res, next) => {
  try {
    const body = req.body || {};
    const validationError = validateDesignBody(body);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const checked = await validateProductAndAsset({
      productId: body.productId,
      variant: body.variant,
      assetId: body.assetId || body.assetIds?.[0] || null,
      assetIds: body.assetIds || [],
      userId: req.user.id,
    });
    if (checked.error) return next(checked.error);
    if (checked.message) {
      return res.status(400).json({ success: false, message: checked.message });
    }

    const designData = {
      ...body.designData,
      variant: checked.variant,
      assetId: body.assetId || body.assetIds?.[0] || null,
      assetIds: body.assetIds || [],
    };

    const { data, error } = await supabaseAdmin
      .from("saved_designs")
      .insert({
        user_id: req.user.id,
        product_id: body.productId,
        design_name: body.designName.trim(),
        design_data: designData,
        ai_prompt: typeof body.aiPrompt === "string" ? body.aiPrompt.slice(0, 1000) : null,
        status: "draft",
      })
      .select("id, product_id, design_name, status, created_at, updated_at, design_data, ai_prompt")
      .single();

    if (error) return next(error);
    return res.status(201).json({ success: true, design: data });
  } catch (error) {
    next(error);
  }
});

// Update only an existing draft owned by the signed-in customer.
router.patch("/designs/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ success: false, message: "Invalid design ID." });
    }

    const body = req.body || {};
    const validationError = validateDesignBody(body);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const checked = await validateProductAndAsset({
      productId: body.productId,
      variant: body.variant,
      assetId: body.assetId || null,
      assetIds: body.assetIds || [],
      userId: req.user.id,
    });
    if (checked.error) return next(checked.error);
    if (checked.message) {
      return res.status(400).json({ success: false, message: checked.message });
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("saved_designs")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (readError) return next(readError);
    if (!existing) return res.status(404).json({ success: false, message: "Design not found." });
    if (existing.status !== "draft") {
      return res.status(409).json({ success: false, message: "Only draft designs can be edited." });
    }

    const { data, error } = await supabaseAdmin
      .from("saved_designs")
      .update({
        product_id: body.productId,
        design_name: body.designName.trim(),
        design_data: {
          ...body.designData,
          variant: checked.variant,
          assetId: body.assetId || body.assetIds?.[0] || null,
          assetIds: body.assetIds || [],
        },
        ai_prompt: typeof body.aiPrompt === "string" ? body.aiPrompt.slice(0, 1000) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", req.user.id)
      .eq("status", "draft")
      .select("id, product_id, design_name, status, created_at, updated_at, design_data, ai_prompt")
      .maybeSingle();

    if (error) return next(error);
    if (!data)
      return res.status(409).json({ success: false, message: "Design is no longer editable." });

    return res.json({ success: true, design: data });
  } catch (error) {
    next(error);
  }
});
// Delete only a draft owned by the signed-in customer.
router.delete("/designs/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid design ID.",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("saved_designs")
      .delete()
      .eq("id", id)
      .eq("user_id", req.user.id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();

    if (error) return next(error);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Draft not found or no longer editable.",
      });
    }

    return res.json({
      success: true,
      message: "Draft deleted successfully.",
      id: data.id,
    });
  } catch (error) {
    next(error);
  }
});
// Get the signed-in customer's profile.
router.get("/profile", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, role, created_at, updated_at")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) return next(error);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Your profile has not been created yet.",
      });
    }

    return res.json({ success: true, profile: { ...data, email: req.user.email } });
  } catch (error) {
    next(error);
  }
});

// Update only the signed-in customer's editable profile fields.
router.patch("/profile", async (req, res, next) => {
  try {
    const body = req.body || {};
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(body, "fullName")) {
      if (
        typeof body.fullName !== "string" ||
        !body.fullName.trim() ||
        body.fullName.trim().length > 100
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Name must contain between 1 and 100 characters." });
      }
      updates.full_name = body.fullName.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      if (
        body.phone !== null &&
        (typeof body.phone !== "string" || body.phone.trim().length > 30)
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Phone number must be text of at most 30 characters." });
      }
      updates.phone = body.phone === null ? null : body.phone.trim() || null;
    }

    if (!Object.keys(updates).length) {
      return res
        .status(400)
        .json({ success: false, message: "Provide a name or phone number to update." });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", req.user.id)
      .select("id, full_name, phone, role, created_at, updated_at")
      .maybeSingle();

    if (error) return next(error);
    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Your profile has not been created yet." });
    }

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      profile: { ...data, email: req.user.email },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/feedback", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("customer_feedback")
      .select("id, category, rating, message, status, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return next(error);
    return res.json({ success: true, feedback: data || [] });
  } catch (error) {
    return next(error);
  }
});

router.post("/feedback", feedbackLimiter, async (req, res, next) => {
  try {
    const { category, rating, message } = req.body || {};
    const cleanMessage = typeof message === "string" ? message.trim() : "";

    if (!feedbackCategories.has(category)) {
      return res.status(400).json({ success: false, message: "Choose a feedback category." });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Choose a rating from 1 to 5." });
    }
    if (cleanMessage.length < 10 || cleanMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Feedback must contain between 10 and 2,000 characters.",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("customer_feedback")
      .insert({
        user_id: req.user.id,
        category,
        rating,
        message: cleanMessage,
      })
      .select("id, category, rating, message, status, created_at")
      .single();

    if (error) return next(error);
    return res.status(201).json({ success: true, feedback: data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
