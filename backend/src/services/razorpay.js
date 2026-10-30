const crypto = require("node:crypto");

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const error = new Error("Razorpay is not configured. Add test API keys to backend/.env.");
    error.status = 503;
    throw error;
  }
  if (!keyId.startsWith("rzp_test_") && !keyId.startsWith("rzp_live_")) {
    const error = new Error("Razorpay Key ID must be a test or live API key.");
    error.status = 503;
    throw error;
  }
  if (keyId.startsWith("rzp_live_") && process.env.RAZORPAY_LIVE_ENABLED !== "true") {
    const error = new Error(
      "Live payments are disabled. Configure test credentials or explicitly enable live payments.",
    );
    error.status = 503;
    throw error;
  }
  return { keyId, keySecret };
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      payload?.error?.description || "Razorpay could not process the payment request.",
    );
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return payload;
}

function verifyPaymentSignature(orderId, paymentId, signature) {
  const { keySecret } = credentials();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(typeof signature === "string" ? signature : "", "hex");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function verifyWebhookSignature(body, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || typeof signature !== "string") return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

module.exports = { credentials, razorpayRequest, verifyPaymentSignature, verifyWebhookSignature };
