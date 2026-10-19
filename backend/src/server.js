require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { resolveTrustProxyHops } = require("./services/proxyTrust");
const ordersRouter = require("./routes/orders");

const productsRouter = require("./routes/products");
const authRouter = require("./routes/auth");
const accountRouter = require("./routes/account");
const adminProductsRouter = require("./routes/adminProducts");
const adminCustomersRouter = require("./routes/adminCustomers");
const adminOrdersRouter = require("./routes/adminOrders");
const adminFeedbackRouter = require("./routes/adminFeedback");
const designAssetsRouter = require("./routes/designAssets");
const analyticsRouter = require("./routes/analytics");
const aiRouter = require("./routes/ai");
const razorpayWebhookRouter = require("./routes/razorpayWebhook");
const app = express();
const PORT = process.env.PORT || 5000;
const frontendUrl = process.env.FRONTEND_URL;
const trustProxyHops = resolveTrustProxyHops();

if (process.env.NODE_ENV === "production" && !frontendUrl) {
  throw new Error("FRONTEND_URL must be set to the production storefront origin.");
}
if (frontendUrl && new URL(frontendUrl).origin !== frontendUrl.replace(/\/$/, "")) {
  throw new Error("FRONTEND_URL must contain only the storefront origin, without a path.");
}
if (process.env.NODE_ENV === "production" && !frontendUrl.startsWith("https://")) {
  throw new Error("FRONTEND_URL must use HTTPS in production.");
}
const allowedFrontendOrigin = frontendUrl ? new URL(frontendUrl).origin : "http://localhost:8080";

app.disable("x-powered-by");
if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
  next();
});

app.use(
  cors({
    origin: allowedFrontendOrigin,
  }),
);

// Razorpay signs the exact raw request bytes, so mount this before express.json().
app.use("/api/webhooks/razorpay", razorpayWebhookRouter);
app.use(express.json({ limit: "1mb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again shortly." },
  }),
);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Bhasi Gift Studio API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/products", productsRouter);
app.use("/api/auth", authRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/account", accountRouter);
app.use("/api/admin/products", adminProductsRouter);
app.use("/api/admin/orders", adminOrdersRouter);
app.use("/api/admin/feedback", adminFeedbackRouter);
app.use("/api/admin/customers", adminCustomersRouter);
app.use("/api/design-assets", designAssetsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/ai", aiRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`Bhasi Gift Studio API running on port ${PORT}`);
});
