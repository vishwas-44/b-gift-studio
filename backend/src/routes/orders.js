
const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const {
      items,
      shippingAddress,
      recipientDetails = null,
      customerNote = null,
    } = req.body;

    if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Provide between 1 and 20 order items.",
      });
    }

    if (
      !shippingAddress ||
      typeof shippingAddress !== "object" ||
      Array.isArray(shippingAddress) ||
      !shippingAddress.fullName ||
      !shippingAddress.phone ||
      !shippingAddress.addressLine1 ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.postalCode
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete all required shipping address fields.",
      });
    }

    for (const item of items) {
      if (
        !item ||
        !isUuid(item.productId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 50
      ) {
        return res.status(400).json({
          success: false,
          message: "Each item needs a valid product ID and quantity from 1 to 50.",
        });
      }

      if (
        item.customizationSnapshot !== undefined &&
        (item.customizationSnapshot === null ||
          typeof item.customizationSnapshot !== "object" ||
          Array.isArray(item.customizationSnapshot))
      ) {
        return res.status(400).json({
          success: false,
          message: "Customization data must be an object.",
        });
      }
    }

    if (
      recipientDetails !== null &&
      (typeof recipientDetails !== "object" || Array.isArray(recipientDetails))
    ) {
      return res.status(400).json({
        success: false,
        message: "Recipient details must be an object.",
      });
    }

    if (
      customerNote !== null &&
      (typeof customerNote !== "string" || customerNote.length > 1000)
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer note must be text of at most 1000 characters.",
      });
    }

    const quantities = new Map();

    for (const item of items) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) || 0) + item.quantity
      );
    }

    const productIds = [...quantities.keys()];

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, name, price, currency, stock_quantity, is_active")
      .in("id", productIds);

    if (productsError) {
      return next(productsError);
    }

    if (products.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more products do not exist.",
      });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));

    for (const [productId, quantity] of quantities) {
      const product = productMap.get(productId);

      if (!product.is_active) {
        return res.status(400).json({
          success: false,
          message: `${product.name} is currently unavailable.`,
        });
      }

      if (
        product.stock_quantity !== null &&
        quantity > product.stock_quantity
      ) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}.`,
        });
      }
    }

    const currency = products[0].currency || "INR";

    if (products.some((product) => (product.currency || "INR") !== currency)) {
      return res.status(400).json({
        success: false,
        message: "Products with different currencies cannot be ordered together.",
      });
    }

    const orderItems = items.map((item) => {
      const product = productMap.get(item.productId);

      return {
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: Number(product.price),
        customization_snapshot: item.customizationSnapshot || {},
      };
    });

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0
    );

    // Shipping and tax remain zero until the business rules are confirmed.
    const shippingFee = 0;
    const taxAmount = 0;
    const totalAmount = subtotal + shippingFee + taxAmount;

    // The user ID always comes from the verified access token.
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: req.user.id,
        subtotal,
        shipping_fee: shippingFee,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        shipping_address: shippingAddress,
        recipient_details: recipientDetails,
        customer_note: customerNote,
      })
      .select(
        "id, order_number, status, payment_status, subtotal, shipping_fee, tax_amount, total_amount, created_at"
      )
      .single();

    if (orderError) {
      return next(orderError);
    }

    const { error: itemsError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems.map((item) => ({ ...item, order_id: order.id })));

    if (itemsError) {
      // Best-effort cleanup if inserting the order items fails.
      const { error: cleanupError } = await supabaseAdmin
        .from("orders")
        .delete()
        .eq("id", order.id)
        .eq("user_id", req.user.id);

      if (cleanupError) {
        console.error("Order cleanup failed:", cleanupError);
      }

      return next(itemsError);
    }

    return res.status(201).json({
      success: true,
      message: "Order created successfully.",
      order: {
        ...order,
        currency,
        items: orderItems.map((item) => ({
          productId: item.product_id,
          productName: item.product_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          customizationSnapshot: item.customization_snapshot,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
