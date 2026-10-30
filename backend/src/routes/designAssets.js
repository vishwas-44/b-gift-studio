const express = require("express");
const multer = require("multer");
const { randomUUID } = require("crypto");
const supabaseAdmin = require("../supabaseAdmin");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const BUCKET = "customer-design-assets";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { mime: "image/png", extension: "png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }

  return null;
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function getOwnedDraft(designId, userId) {
  return supabaseAdmin
    .from("saved_designs")
    .select("id, status")
    .eq("id", designId)
    .eq("user_id", userId)
    .maybeSingle();
}

// POST /api/design-assets
// Multipart fields: file, designId (optional), assetType (optional),
// aiPrompt (optional), aiStyle (optional).
router.post(
  "/",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          const message =
            error.code === "LIMIT_FILE_SIZE"
              ? "Image must be 10 MB or smaller."
              : "Please upload one image at a time.";

          return res.status(400).json({ success: false, message });
        }

        return next(error);
      }

      next();
    });
  },
  async (req, res, next) => {
    let uploadedPath;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Choose an image to upload.",
        });
      }

      const image = detectImageType(req.file.buffer);

      if (!image) {
        return res.status(400).json({
          success: false,
          message: "Upload a valid JPEG, PNG or WebP image.",
        });
      }

      const assetType = req.body.assetType || "original_photo";

      if (!["original_photo", "generated_image", "other"].includes(assetType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid asset type.",
        });
      }

      const designId = req.body.designId || null;

      if (designId !== null) {
        if (!isUuid(designId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid design ID.",
          });
        }

        const { data: design, error } = await getOwnedDraft(designId, req.user.id);

        if (error) return next(error);

        if (!design) {
          return res.status(404).json({
            success: false,
            message: "Saved design not found.",
          });
        }

        if (design.status !== "draft") {
          return res.status(409).json({
            success: false,
            message: "Only draft designs can receive new assets.",
          });
        }
      }

      const aiPrompt = req.body.aiPrompt || null;
      const aiStyle = req.body.aiStyle || null;

      if (
        (aiPrompt !== null && (typeof aiPrompt !== "string" || aiPrompt.length > 1000)) ||
        (aiStyle !== null && (typeof aiStyle !== "string" || aiStyle.length > 100))
      ) {
        return res.status(400).json({
          success: false,
          message: "Prompt or style exceeds the allowed length.",
        });
      }

      const storagePath = `${req.user.id}/${randomUUID()}.${image.extension}`;

      const { error: storageError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storagePath, req.file.buffer, {
          contentType: image.mime,
          upsert: false,
        });

      if (storageError) return next(storageError);

      uploadedPath = storagePath;

      const { data: asset, error: insertError } = await supabaseAdmin
        .from("design_assets")
        .insert({
          user_id: req.user.id,
          design_id: designId,
          storage_path: storagePath,
          asset_type: assetType,
          mime_type: image.mime,
          file_size_bytes: req.file.size,
          ai_prompt: aiPrompt,
          ai_style: aiStyle,
          metadata: {},
        })
        .select("id, design_id, storage_path, asset_type, mime_type, file_size_bytes, created_at")
        .single();

      if (insertError) {
        const { error: rollbackError } = await supabaseAdmin.storage
          .from(BUCKET)
          .remove([storagePath]);

        if (rollbackError) {
          console.error("Asset upload rollback failed:", rollbackError.message);
        }

        uploadedPath = undefined;
        return next(insertError);
      }

      uploadedPath = undefined;

      return res.status(201).json({
        success: true,
        asset,
      });
    } catch (error) {
      if (uploadedPath) {
        const { error: rollbackError } = await supabaseAdmin.storage
          .from(BUCKET)
          .remove([uploadedPath]);

        if (rollbackError) {
          console.error("Asset upload rollback failed:", rollbackError.message);
        }
      }

      next(error);
    }
  },
);

router.get("/:assetId/preview", requireAuth, async (req, res, next) => {
  try {
    const { assetId } = req.params;

    if (!isUuid(assetId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid asset ID.",
      });
    }

    const { data: asset, error } = await supabaseAdmin
      .from("design_assets")
      .select("id, user_id, storage_path, deleted_at")
      .eq("id", assetId)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) return next(error);

    if (!asset || asset.deleted_at) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    const { data, error: signedUrlError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(asset.storage_path, 60 * 5);

    if (signedUrlError) return next(signedUrlError);

    return res.json({
      success: true,
      previewUrl: data.signedUrl,
      expiresInSeconds: 300,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/design-assets/:assetId
// Only unused assets may be deleted through this customer endpoint.
router.delete("/:assetId", requireAuth, async (req, res, next) => {
  try {
    const { assetId } = req.params;

    if (!isUuid(assetId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid asset ID.",
      });
    }

    const { data: asset, error } = await supabaseAdmin
      .from("design_assets")
      .select("id, user_id, design_id, storage_path, order_item_id, deleted_at")
      .eq("id", assetId)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) return next(error);

    if (!asset || asset.deleted_at) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    if (asset.order_item_id) {
      return res.status(409).json({
        success: false,
        message: "Ordered artwork cannot be deleted by the customer.",
      });
    }

    if (asset.design_id) {
      const { data: design, error: designError } = await getOwnedDraft(
        asset.design_id,
        req.user.id,
      );

      if (designError) return next(designError);

      if (!design || design.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Only assets belonging to an existing draft can be deleted.",
        });
      }
    }

    const { error: storageError } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([asset.storage_path]);

    if (storageError) return next(storageError);

    const { error: updateError } = await supabaseAdmin
      .from("design_assets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", asset.id)
      .eq("user_id", req.user.id)
      .is("deleted_at", null)
      .is("order_item_id", null);

    if (updateError) {
      console.error("Asset metadata update failed:", updateError.message);

      return res.status(500).json({
        success: false,
        message: "The file was removed, but its metadata needs administrator review.",
      });
    }

    return res.json({
      success: true,
      message: "Draft asset deleted.",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
