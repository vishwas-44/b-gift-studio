const crypto = require("crypto");

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function generateOtp() {
  return crypto
    .randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

function hashOtp(email, otp) {
  const secret = process.env.OTP_HASH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("OTP_HASH_SECRET must be configured with at least 32 characters.");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${email.trim().toLowerCase()}:${otp}`)
    .digest("hex");
}

function getOtpExpiry() {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
}

function isOtpExpired(expiresAt) {
  return !expiresAt || Date.parse(expiresAt) <= Date.now();
}

function isResendAllowed(lastSentAt) {
  if (!lastSentAt) return true;

  return Date.now() - Date.parse(lastSentAt) >= RESEND_COOLDOWN_SECONDS * 1000;
}

function hasAttemptsRemaining(attempts) {
  return Number.isInteger(attempts) && attempts < MAX_ATTEMPTS;
}

function otpHashesMatch(expectedHash, suppliedHash) {
  if (
    typeof expectedHash !== "string" ||
    typeof suppliedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expectedHash) ||
    !/^[a-f0-9]{64}$/i.test(suppliedHash)
  ) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(suppliedHash, "hex"));
}

module.exports = {
  generateOtp,
  hashOtp,
  getOtpExpiry,
  isOtpExpired,
  isResendAllowed,
  hasAttemptsRemaining,
  otpHashesMatch,
};
