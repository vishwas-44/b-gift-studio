const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const requireAdmin = require("../middleware/requireAdmin");
const { isSafeTrackingUrl, isValidShipmentDate } = require("../services/shipmentValidation");

const router = express.Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHIPMENT_FIELDS =
  "courier_company, custom_courier_name, tracking_id, shipment_date, tracking_url, courier_charge, courier_charge_paid_by, courier_charge_payment_status, shipment_created_at, shipment_updated_at";
const MANUAL_PAYMENT_FIELDS =
  "manual_payment_reference, manual_payment_reference_submitted_at, payment_verified_at, payment_verified_by";
const DESIGN_ASSETS_BUCKET = "customer-design-assets";

async function attachArtworkLinks(item, userId) {
  const designData = item.customization_snapshot?.designData;
  const listedIds = Array.isArray(designData?.assetIds) ? designData.assetIds : [];
  const assetIds = [
    ...new Set([...listedIds, ...(designData?.assetId ? [designData.assetId] : [])]),
  ]
    .filter((assetId) => UUID_PATTERN.test(typeof assetId === "string" ? assetId : ""))
    .slice(0, 20);
  if (!assetIds.length) return { ...item, artworks: [] };

  const { data: assets, error } = await supabaseAdmin
    .from("design_assets")
    .select("id, user_id, storage_path, mime_type, deleted_at")
    .in("id", assetIds)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;

  const bucket = supabaseAdmin.storage.from(DESIGN_ASSETS_BUCKET);
  const artworks = await Promise.all(
    assetIds.map(async (assetId, index) => {
      const asset = assets?.find((row) => row.id === assetId);
      if (!asset || !asset.storage_path.startsWith(`${userId}/`)) return null;
      const [previewResult, downloadResult] = await Promise.all([
        bucket.createSignedUrl(asset.storage_path, 60 * 15),
        bucket.createSignedUrl(asset.storage_path, 60 * 15, { download: true }),
      ]);
      if (previewResult.error || downloadResult.error)
        throw previewResult.error || downloadResult.error;
      return {
        index: index + 1,
        previewUrl: previewResult.data.signedUrl,
        downloadUrl: downloadResult.data.signedUrl,
        mimeType: asset.mime_type,
        expiresInSeconds: 900,
      };
    }),
  );
  return { ...item, artworks: artworks.filter(Boolean) };
}

// Every endpoint requires a verified administrator.
router.use(requireAdmin);

// GET /api/admin/orders
// Supports pagination, order-number search, status and payment filters.
router.get("/", async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const paymentStatus =
      typeof req.query.payment_status === "string" ? req.query.payment_status.trim() : "";

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

    if (search.length > 100 || status.length > 50 || paymentStatus.length > 50) {
      return res.status(400).json({
        success: false,
        message: "A search or filter value is too long.",
      });
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("orders")
      .select(
        `id, order_number, user_id, status, payment_status, payment_method, subtotal, shipping_fee, tax_amount, total_amount, shipping_address, recipient_details, customer_note, created_at, updated_at, ${SHIPMENT_FIELDS}, ${MANUAL_PAYMENT_FIELDS}`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      // Escape characters that have special meaning in PostgREST filters.
      const safeSearch = search.replace(/[\\%_(),."]/g, "");
      if (safeSearch) {
        query = query.ilike("order_number", `%${safeSearch}%`);
      }
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (paymentStatus) {
      query = query.eq("payment_status", paymentStatus);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Admin order list query failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to load orders.",
      });
    }

    return res.status(200).json({
      success: true,
      orders: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/manual-payment/verify", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID." });
    }
    if (Object.keys(req.body || {}).length) {
      return res
        .status(400)
        .json({ success: false, message: "Unexpected payment verification field." });
    }
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "paid",
        payment_verified_at: new Date().toISOString(),
        payment_verified_by: req.user.id,
      })
      .eq("id", id)
      .eq("payment_method", "manual_upi_qr")
      .eq("payment_status", "unpaid")
      .not("manual_payment_reference", "is", null)
      .select(
        "id, order_number, payment_status, payment_method, payment_verified_at, payment_verified_by",
      )
      .maybeSingle();
    if (error) {
      if (["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code)) {
        return res.status(503).json({
          success: false,
          message:
            "Apply supabase/migrations/20261018080000_manual_upi_qr_payment.sql before verifying UPI payments.",
        });
      }
      return next(error);
    }
    if (!data) {
      return res.status(409).json({
        success: false,
        message:
          "This order is not awaiting manual UPI verification or has no submitted transaction reference.",
      });
    }
    return res.json({ success: true, order: data, message: "UPI payment marked verified." });
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/admin/orders/:id/fulfillment
// Status/shipment updates are persisted atomically by a restricted database RPC.
router.patch("/:id/fulfillment", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID." });
    }
    const body = req.body || {};
    const allowed = new Set([
      "status",
      "confirmHandover",
      "courierCompany",
      "customCourierName",
      "trackingId",
      "shipmentDate",
      "trackingUrl",
      "courierCharge",
      "courierChargePaidBy",
      "courierChargePaymentStatus",
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return res.status(400).json({ success: false, message: "Unexpected fulfillment field." });
    }
    const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    if (!["pending", "processing", "shipped", "delivered", "cancelled"].includes(status)) {
      return res.status(400).json({ success: false, message: "Choose a valid order status." });
    }
    const courierCompany =
      typeof body.courierCompany === "string" ? body.courierCompany.trim() : "";
    const customCourierName =
      typeof body.customCourierName === "string" ? body.customCourierName.trim() : "";
    const trackingId = typeof body.trackingId === "string" ? body.trackingId.trim() : "";
    const trackingUrl = typeof body.trackingUrl === "string" ? body.trackingUrl.trim() : "";
    const shipmentDate = typeof body.shipmentDate === "string" ? body.shipmentDate.trim() : "";
    const courierCharge = Number(body.courierCharge);
    const courierChargePaidBy = body.courierChargePaidBy;
    const courierChargePaymentStatus = body.courierChargePaymentStatus;
    if (!Number.isFinite(courierCharge) || courierCharge < 0 || courierCharge > 1000000) {
      return res
        .status(400)
        .json({ success: false, message: "Enter a valid courier bill amount." });
    }
    if (!["admin", "customer"].includes(courierChargePaidBy)) {
      return res.status(400).json({ success: false, message: "Choose who paid the courier bill." });
    }
    if (!["paid", "unpaid"].includes(courierChargePaymentStatus)) {
      return res
        .status(400)
        .json({ success: false, message: "Choose the courier bill payment status." });
    }
    if (courierChargePaidBy === "admin" && courierChargePaymentStatus !== "paid") {
      return res
        .status(400)
        .json({ success: false, message: "Mark the bill paid when the admin paid the courier." });
    }
    if (!["", "FedEx", "DHL", "Other"].includes(courierCompany)) {
      return res
        .status(400)
        .json({ success: false, message: "Choose FedEx, DHL or Other as the courier." });
    }
    if (status === "shipped" && body.confirmHandover !== true) {
      return res.status(400).json({
        success: false,
        message: "Confirm that the courier has accepted the parcel before marking it shipped.",
      });
    }
    if (customCourierName.length > 100 || trackingId.length > 120 || trackingUrl.length > 2048) {
      return res
        .status(400)
        .json({ success: false, message: "Courier name, tracking ID or URL is too long." });
    }
    if (shipmentDate && !isValidShipmentDate(shipmentDate)) {
      return res.status(400).json({ success: false, message: "Enter a valid shipment date." });
    }
    if (trackingUrl) {
      if (!isSafeTrackingUrl(trackingUrl)) {
        return res.status(400).json({
          success: false,
          message: "Tracking URL must be a safe HTTP or HTTPS link without embedded credentials.",
        });
      }
    }
    if (
      status === "shipped" &&
      (!courierCompany ||
        (courierCompany === "Other" && !customCourierName) ||
        !trackingId ||
        !shipmentDate ||
        !trackingUrl)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter courier, tracking ID, handover date and official tracking URL before confirming courier handover.",
      });
    }
    const { data, error } = await supabaseAdmin.rpc("admin_update_order_fulfillment", {
      p_order_id: id,
      p_admin_id: req.user.id,
      p_status: status,
      p_confirm_handover: body.confirmHandover === true,
      p_courier_company: courierCompany || null,
      p_custom_courier_name: customCourierName || null,
      p_tracking_id: trackingId || null,
      p_shipment_date: shipmentDate || null,
      p_tracking_url: trackingUrl || null,
      p_courier_charge: courierCharge,
      p_courier_charge_paid_by: courierChargePaidBy,
      p_courier_charge_payment_status: courierChargePaymentStatus,
    });
    if (error) {
      console.error("Admin order fulfillment update failed:", error.message);
      if (["PGRST202", "PGRST204", "PGRST205", "42703", "42P01"].includes(error.code)) {
        return res.status(503).json({
          success: false,
          message:
            "Courier billing database setup is incomplete. Apply supabase/migrations/20261018070000_courier_bill_tracking.sql, then retry.",
        });
      }
      if (error.code === "P0002")
        return res.status(404).json({ success: false, message: "Order not found." });
      if (error.code === "22023")
        return res.status(409).json({ success: false, message: error.message });
      return res.status(500).json({ success: false, message: "Unable to save order fulfillment." });
    }
    return res
      .status(200)
      .json({ success: true, message: "Order fulfillment saved.", order: data });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/orders/:id
// Returns one order and its saved order-item/customization snapshots.
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        `id, order_number, user_id, status, payment_status, payment_method, subtotal, shipping_fee, tax_amount, total_amount, shipping_address, recipient_details, customer_note, created_at, updated_at, ${SHIPMENT_FIELDS}, ${MANUAL_PAYMENT_FIELDS}`,
      )
      .eq("id", id)
      .maybeSingle();

    if (orderError) {
      console.error("Admin order detail query failed:", orderError.message);
      return res.status(500).json({
        success: false,
        message: "Unable to load order details.",
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, order_id, product_id, product_name, variant, quantity, unit_price, customization_snapshot, created_at",
      )
      .eq("order_id", id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      console.error("Admin order items query failed:", itemsError.message);
      return res.status(500).json({
        success: false,
        message: "Unable to load order items.",
      });
    }

    const itemsWithArtwork = await Promise.all(
      (items || []).map((item) => attachArtworkLinks(item, order.user_id)),
    );

    return res.status(200).json({
      success: true,
      order: {
        ...order,
        items: itemsWithArtwork,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
