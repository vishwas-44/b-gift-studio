
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const ordersRouter = require("./routes/orders");

const productsRouter = require("./routes/products");
const authRouter = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  })
);

app.use(express.json({ limit: "1mb" }));

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

