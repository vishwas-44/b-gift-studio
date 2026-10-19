const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const requireAuth = require("../middleware/requireAuth");
const { canonicalVariant } = require("../services/productVariants");
const { credentials, razorpayRequest, verifyPaymentSignature } = require("../services/razorpay");
const { sendOrderNotification } = require("../services/orderNotifications");

const router = express.Router();
router.use(requireAuth);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS_FIELDS = ["fullName", "phone", "addressLine1", "city", "state", "postalCode"];

function manualUpiConfiguration() {
  const upiQrImageUrl = process.env.UPI_QR_IMAGE_URL || "";
  const merchantUpiId = process.env.MERCHANT_UPI_ID || "";
  try {
    const imageUrl = new URL(upiQrImageUrl);
    if (
      imageUrl.protocol !== "https:" ||
      !/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,60}$/.test(merchantUpiId)
    )
      return null;
    return { upiQrImageUrl: imageUrl.toString(), merchantUpiId };
  } catch {
    return null;
  }
}

router.get("/payment-methods", (req, res) => {
  let razorpay = false;
  try {
    credentials();
    razorpay = true;
  } catch {
    // COD remains available while online payments are not configured.
  }
  const upi = manualUpiConfiguration();
  return res.json({
    success: true,
    paymentMethods: {
      razorpay,
      cashOnDelivery: true,
      manualUpiQr: Boolean(upi),
      upiQrImageUrl: upi?.upiQrImageUrl || "",
      merchantUpiId: upi?.merchantUpiId || "",
    },
  });
});

function checkoutSchemaUnavailable(error) {
  return ["42703", "42P01", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code);
}

function sendMigrationMessage(res) {
  return res.status(503).json({
    success: false,
    message:
      "Checkout database setup is incomplete. Apply supabase/migrations/20261018000000_orders_checkout.sql in the Supabase SQL Editor, then retry.",
  });
}

function cleanAddress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const address = {
    fullName: typeof value.fullName === "string" ? value.fullName.trim() : "",
    phone: typeof value.phone === "string" ? value.phone.trim() : "",
    addressLine1: typeof value.addressLine1 === "string" ? value.addressLine1.trim() : "",
    addressLine2: typeof value.addressLine2 === "string" ? value.addressLine2.trim() : "",
    city: typeof value.city === "string" ? value.city.trim() : "",
    state: typeof value.state === "string" ? value.state.trim() : "",
    postalCode: typeof value.postalCode === "string" ? value.postalCode.trim() : "",
    country:
      typeof value.country === "string" && value.country.trim() ? value.country.trim() : "India",
  };
  if (ADDRESS_FIELDS.some((field) => !address[field])) return null;
  if (
    address.fullName.length > 100 ||
    address.phone.length > 30 ||
    address.addressLine1.length > 200 ||
    address.addressLine2.length > 200 ||
    address.city.length > 100 ||
    address.state.length > 100 ||
    address.postalCode.length > 20 ||
    address.country.length > 80
  )
    return null;
  return address;
}

router.get("/address", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("customer_addresses")
      .select("full_name, phone, address_line1, address_line2, city, state, postal_code, country")
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (error) return checkoutSchemaUnavailable(error) ? sendMigrationMessage(res) : next(error);
    return res.json({
      success: true,
      address: data
        ? {
            fullName: data.full_name,
            phone: data.phone,
            addressLine1: data.address_line1,
            addressLine2: data.address_line2 || "",
            city: data.city,
            state: data.state,
            postalCode: data.postal_code,
            country: data.country,
          }
        : null,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/mine", async (req, res, next) => {
  try {
    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_status, payment_method, subtotal, shipping_fee, tax_amount, total_amount, currency, shipping_address, courier_company, custom_courier_name, tracking_id, shipment_date, tracking_url, courier_charge, courier_charge_paid_by, courier_charge_payment_status, manual_payment_reference, manual_payment_reference_submitted_at, payment_verified_at, shipment_created_at, shipment_updated_at, created_at",
      )
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return checkoutSchemaUnavailable(error) ? sendMigrationMessage(res) : next(error);
    const ids = (orders || []).map((order) => order.id);
    let items = [];
    if (ids.length) {
      const result = await supabaseAdmin
        .from("order_items")
        .select("id, order_id, product_name, variant, quantity, unit_price, customization_snapshot")
        .in("order_id", ids)
        .order("created_at", { ascending: true });
      if (result.error)
        return checkoutSchemaUnavailable(result.error)
          ? sendMigrationMessage(res)
          : next(result.error);
      items = result.data || [];
    }
    const grouped = new Map();
    for (const item of items)
      grouped.set(item.order_id, [...(grouped.get(item.order_id) || []), item]);
    return res.json({
      success: true,
      orders: (orders || []).map((order) => ({ ...order, items: grouped.get(order.id) || [] })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = req.body || {};
    const useRazorpay = body.paymentProvider === "razorpay";
    const useCashOnDelivery = body.paymentProvider === "cash_on_delivery";
    const useManualUpiQr = body.paymentProvider === "manual_upi_qr";
    if (!useRazorpay && !useCashOnDelivery && !useManualUpiQr) {
      return res
        .status(400)
        .json({ success: false, message: "Choose a supported payment method." });
    }
    if (useRazorpay) credentials();
    if (useManualUpiQr && !manualUpiConfiguration()) {
      return res.status(503).json({
        success: false,
        message: "Manual UPI QR payment is not configured yet.",
      });
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
      return res
        .status(400)
        .json({ success: false, message: "Provide between 1 and 20 order items." });
    }
    const shippingAddress = cleanAddress(body.shippingAddress);
    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid delivery name, phone and complete address.",
      });
    }
    const items = [];
    for (const item of body.items) {
      if (
        !item ||
        !UUID_PATTERN.test(item.productId || "") ||
        typeof item.variant !== "string" ||
        !item.variant.trim() ||
        item.variant.length > 100 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 50
      ) {
        return res.status(400).json({
          success: false,
          message: "Each cart item must have a valid product, variant and quantity from 1 to 50.",
        });
      }
      if (
        item.designId !== undefined &&
        item.designId !== null &&
        (typeof item.designId !== "string" || !UUID_PATTERN.test(item.designId))
      ) {
        return res
          .status(400)
          .json({ success: false, message: "A saved design reference is invalid." });
      }
      items.push({
        productId: item.productId,
        variant: item.variant.trim(),
        quantity: item.quantity,
        ...(item.designId ? { designId: item.designId } : {}),
      });
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, name, variants, is_active")
      .in("id", productIds);
    if (productsError) {
      if (checkoutSchemaUnavailable(productsError)) return sendMigrationMessage(res);
      return next(productsError);
    }
    const productsById = new Map((products || []).map((product) => [product.id, product]));
    for (const item of items) {
      const product = productsById.get(item.productId);
      if (!product || !product.is_active) {
        return res
          .status(400)
          .json({ success: false, message: "A product in your bag is unavailable." });
      }
      const variant = canonicalVariant(product.variants, item.variant);
      if (!variant) {
        const options = Array.isArray(product.variants)
          ? product.variants.join(", ")
          : "none configured";
        return res.status(400).json({
          success: false,
          message: `The selected variant for ${product.name} is unavailable. Available options: ${options}.`,
        });
      }
      // Use the exact backend catalogue value for the transactional RPC.
      item.variant = variant;
    }

    const requestKey = req.get("Idempotency-Key");
    if (!UUID_PATTERN.test(requestKey || "")) {
      return res.status(400).json({
        success: false,
        message: "Invalid checkout request key. Refresh checkout and retry.",
      });
    }
    const { data: order, error } = await supabaseAdmin.rpc("create_customer_order_idempotent", {
      p_user_id: req.user.id,
      p_items: items,
      p_shipping_address: shippingAddress,
      p_request_key: requestKey,
    });
    if (error) {
      console.error("Checkout order creation failed:", error.message);
      if (checkoutSchemaUnavailable(error)) return sendMigrationMessage(res);
      const status = error.code === "P0001" ? 409 : error.code === "22023" ? 400 : 500;
      return res.status(status).json({
        success: false,
        message:
          status === 500
            ? "Unable to place this order. Your bag has not been cleared."
            : error.message,
      });
    }
    if (useRazorpay) {
      if (order.razorpay_order_id) {
        return res.status(201).json({
          success: true,
          order: { ...order, payment_method: "razorpay" },
          payment: {
            keyId: credentials().keyId,
            orderId: order.razorpay_order_id,
            amount: Math.round(Number(order.total_amount) * 100),
            currency: order.currency,
          },
        });
      }
      const amount = Math.round(Number(order.total_amount) * 100);
      const paymentOrder = await razorpayRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount,
          currency: order.currency,
          receipt: order.order_number,
          notes: { storefront_order_id: order.id, order_number: order.order_number },
        }),
      });
      const { data: savedOrder, error: saveError } = await supabaseAdmin
        .from("orders")
        .update({ payment_method: "razorpay", razorpay_order_id: paymentOrder.id })
        .eq("id", order.id)
        .eq("user_id", req.user.id)
        .select(
          "id, order_number, status, payment_status, payment_method, subtotal, shipping_fee, tax_amount, total_amount, currency, created_at",
        )
        .single();
      if (saveError) {
        console.error("Could not link Razorpay order:", saveError.message);
        return res.status(503).json({
          success: false,
          message:
            "Payment setup is incomplete. Apply the Razorpay checkout migration, then retry.",
        });
      }
      return res.status(201).json({
        success: true,
        order: {
          ...savedOrder,
          shipping_address: order.shipping_address,
          items: order.items || [],
        },
        payment: {
          keyId: credentials().keyId,
          orderId: paymentOrder.id,
          amount: paymentOrder.amount,
          currency: paymentOrder.currency,
        },
      });
    }
    if (useCashOnDelivery) {
      const { data: codOrder, error: codError } = await supabaseAdmin
        .from("orders")
        .update({ payment_method: "cash_on_delivery" })
        .eq("id", order.id)
        .eq("user_id", req.user.id)
        .select(
          "id, order_number, status, payment_status, payment_method, subtotal, shipping_fee, tax_amount, total_amount, currency, created_at",
        )
        .single();
      if (codError) return next(codError);
      void sendOrderNotification(
        codOrder.id,
        "order_confirmation",
        `${codOrder.id}:order_confirmation`,
      );
      return res.status(201).json({
        success: true,
        message: "Order placed. Payment is due on delivery.",
        order: { ...codOrder, shipping_address: order.shipping_address, items: order.items || [] },
      });
    }
    if (useManualUpiQr) {
      const { data: upiOrder, error: upiError } = await supabaseAdmin
        .from("orders")
        .update({ payment_method: "manual_upi_qr" })
        .eq("id", order.id)
        .eq("user_id", req.user.id)
        .select(
          "id, order_number, status, payment_status, payment_method, subtotal, shipping_fee, tax_amount, total_amount, currency, created_at",
        )
        .single();
      if (upiError) return next(upiError);
      void sendOrderNotification(
        upiOrder.id,
        "order_confirmation",
        `${upiOrder.id}:order_confirmation`,
      );
      return res.status(201).json({
        success: true,
        message: "Order created. Payment remains pending manual verification.",
        order: { ...upiOrder, shipping_address: order.shipping_address, items: order.items || [] },
      });
    }
    return res.status(400).json({ success: false, message: "Choose a supported payment method." });
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  }
});

router.post("/upi-qr/reference", async (req, res, next) => {
  try {
    const { orderId, reference } = req.body || {};
    if (!UUID_PATTERN.test(typeof orderId === "string" ? orderId : "")) {
      return res.status(400).json({ success: false, message: "Invalid order ID." });
    }
    const cleanReference = typeof reference === "string" ? reference.trim() : "";
    if (!/^[A-Za-z0-9-]{8,100}$/.test(cleanReference)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid UPI transaction reference (8–100 letters or numbers).",
      });
    }
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({
        manual_payment_reference: cleanReference,
        manual_payment_reference_submitted_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("user_id", req.user.id)
      .eq("payment_method", "manual_upi_qr")
      .eq("payment_status", "unpaid")
      .select(
        "id, order_number, payment_status, payment_method, manual_payment_reference, manual_payment_reference_submitted_at",
      )
      .maybeSingle();
    if (error) {
      if (checkoutSchemaUnavailable(error))
        return res.status(503).json({
          success: false,
          message:
            "Apply the manual UPI QR payment migration before submitting payment references.",
        });
      return next(error);
    }
    if (!data)
      return res
        .status(404)
        .json({ success: false, message: "Unpaid manual UPI order not found." });
    return res.json({
      success: true,
      order: data,
      message: "Payment reference submitted for admin verification.",
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/razorpay/verify", async (req, res, next) => {
  try {
    const { orderId, paymentId, signature } = req.body || {};
    if (
      ![orderId, paymentId, signature].every(
        (value) => typeof value === "string" && value.length > 0,
      )
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Payment verification details are incomplete." });
    }
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_status, payment_method, total_amount, currency, razorpay_order_id, created_at",
      )
      .eq("user_id", req.user.id)
      .eq("id", orderId)
      .maybeSingle();
    if (error) return checkoutSchemaUnavailable(error) ? sendMigrationMessage(res) : next(error);
    if (!order || order.payment_method !== "razorpay" || !order.razorpay_order_id) {
      return res.status(404).json({ success: false, message: "Payment order not found." });
    }
    if (order.payment_status === "paid") return res.json({ success: true, order });
    if (!verifyPaymentSignature(order.razorpay_order_id, paymentId, signature)) {
      return res
        .status(400)
        .json({ success: false, message: "Payment signature could not be verified." });
    }
    let payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    const expectedAmount = Math.round(Number(order.total_amount) * 100);
    if (
      payment.order_id !== order.razorpay_order_id ||
      payment.amount !== expectedAmount ||
      payment.currency !== order.currency
    ) {
      return res
        .status(409)
        .json({ success: false, message: "Payment does not match the expected storefront order." });
    }
    if (payment.status === "authorized") {
      payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: "POST",
        body: JSON.stringify({ amount: expectedAmount, currency: order.currency }),
      });
    }
    if (payment.status !== "captured") {
      return res.status(409).json({
        success: false,
        message: "Payment has not been captured. Please retry or contact support.",
      });
    }
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "paid",
        payment_method: "razorpay",
        razorpay_payment_id: paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("user_id", req.user.id)
      .eq("payment_status", "unpaid")
      .select(
        "id, order_number, status, payment_status, payment_method, subtotal, shipping_fee, tax_amount, total_amount, currency, created_at",
      )
      .maybeSingle();
    if (updateError) return next(updateError);
    if (!updatedOrder) {
      const { data: currentOrder } = await supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, status, payment_status, payment_method, subtotal, shipping_fee, tax_amount, total_amount, currency, created_at",
        )
        .eq("id", order.id)
        .maybeSingle();
      if (currentOrder?.payment_status === "paid")
        return res.json({ success: true, order: currentOrder });
      return res
        .status(409)
        .json({ success: false, message: "Order payment status changed. Refresh your orders." });
    }
    void sendOrderNotification(
      updatedOrder.id,
      "order_confirmation",
      `${updatedOrder.id}:order_confirmation`,
    );
    return res.json({ success: true, order: updatedOrder });
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  }
});

module.exports = router;
