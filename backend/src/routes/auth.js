const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const supabase = require("../supabase");
const supabaseAdmin = require("../supabaseAdmin");
const { sendEmail } = require("../services/mailer");

const {
  generateOtp,
  hashOtp,
  getOtpExpiry,
  isOtpExpired,
  isResendAllowed,
  hasAttemptsRemaining,
  otpHashesMatch,
} = require("../services/signupOtp");

const router = express.Router();

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset requests. Please try again later.",
  },
});

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification requests. Please try again later.",
  },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification attempts. Please try again later.",
  },
});

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function validEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

function validFullName(fullName) {
  return (
    typeof fullName === "string" && fullName.trim().length >= 1 && fullName.trim().length <= 100
  );
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Find a user without assuming the account is in the first page.
async function findAuthUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const user = data.users.find((item) => item.email?.toLowerCase() === normalizedEmail);

    if (user) return user;
    if (data.users.length < perPage) return null;

    page += 1;
  }
}

// --------------------------------------------------
// SIGNUP: request an OTP
// --------------------------------------------------

async function requestSignupOtp(req, res, next) {
  try {
    const { email, password, fullName } = req.body || {};

    if (!validEmail(email) || !validPassword(password) || !validFullName(fullName)) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid email, a name of 1–100 characters, and a password of 8–128 characters.",
      });
    }

    const normalizedEmail = normalizeEmail(email);

    const { data: existingPending, error: lookupError } = await supabaseAdmin
      .from("pending_signup_otps")
      .select("email,last_sent_at")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (existingPending && !isResendAllowed(existingPending.last_sent_at)) {
      return res.status(429).json({
        success: false,
        message: "Please wait 60 seconds before requesting another code.",
      });
    }

    const otp = generateOtp();
    const now = new Date().toISOString();

    const { error: saveError } = await supabaseAdmin.from("pending_signup_otps").upsert(
      {
        email: normalizedEmail,
        full_name: fullName.trim(),
        otp_hash: hashOtp(normalizedEmail, otp),
        expires_at: getOtpExpiry(),
        attempts: 0,
        last_sent_at: now,
        created_at: now,
      },
      { onConflict: "email" },
    );

    if (saveError) throw saveError;

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "Verify your email — Bhasi Gift Studio",
        text: `Your Bhasi Gift Studio verification code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
            <h2>Bhasi Gift Studio</h2>
            <p>Use this code to verify your email address:</p>
            <p style="font-size:30px;font-weight:bold;letter-spacing:8px">${otp}</p>
            <p>This code expires in 10 minutes.</p>
            <p>If you did not request this code, ignore this email.</p>
          </div>
        `,
      });
    } catch (emailError) {
      await supabaseAdmin.from("pending_signup_otps").delete().eq("email", normalizedEmail);

      throw emailError;
    }

    return res.status(200).json({
      success: true,
      message: "If the address can be used for signup, a verification code has been sent.",
      email: normalizedEmail,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
  } catch (error) {
    next(error);
  }
}

router.post("/signup", otpRequestLimiter, requestSignupOtp);
router.post("/signup/request-otp", otpRequestLimiter, requestSignupOtp);

// --------------------------------------------------
// SIGNUP: verify OTP and create the account
// --------------------------------------------------

router.post("/signup/verify-otp", otpVerifyLimiter, async (req, res, next) => {
  try {
    const { email, otp, password } = req.body || {};

    if (
      !validEmail(email) ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp) ||
      !validPassword(password)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter your email, six-digit verification code, and valid password.",
      });
    }

    const normalizedEmail = normalizeEmail(email);

    const { data: pending, error: lookupError } = await supabaseAdmin
      .from("pending_signup_otps")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (!pending || isOtpExpired(pending.expires_at)) {
      return res.status(400).json({
        success: false,
        message: "The code is invalid or expired. Request a new code.",
      });
    }

    if (!hasAttemptsRemaining(pending.attempts)) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect codes. Request a new code.",
      });
    }

    const suppliedHash = hashOtp(normalizedEmail, otp);

    if (!otpHashesMatch(pending.otp_hash, suppliedHash)) {
      const nextAttempts = pending.attempts + 1;

      const { error: attemptsError } = await supabaseAdmin
        .from("pending_signup_otps")
        .update({ attempts: nextAttempts })
        .eq("email", normalizedEmail)
        .eq("otp_hash", pending.otp_hash);

      if (attemptsError) throw attemptsError;

      return res.status(400).json({
        success: false,
        message:
          nextAttempts >= 5
            ? "Too many incorrect codes. Request a new code."
            : "The verification code is incorrect.",
      });
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: pending.full_name,
      },
    });

    if (createError) {
      if (
        createError.code === "email_exists" ||
        /already been registered|already exists/i.test(createError.message || "")
      ) {
        return res.status(409).json({
          success: false,
          message: "An account may already exist for this email. Try signing in instead.",
        });
      }

      throw createError;
    }

    const user = created.user;

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: user.id,
      full_name: pending.full_name,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      throw profileError;
    }

    await supabaseAdmin.from("pending_signup_otps").delete().eq("email", normalizedEmail);

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (loginError) {
      return res.status(201).json({
        success: true,
        message: "Email verified and account created. Please sign in.",
        user: { id: user.id, email: user.email },
        session: null,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Email verified and account created successfully.",
      user: {
        id: loginData.user.id,
        email: loginData.user.email,
      },
      session: loginData.session,
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!validEmail(email) || typeof password !== "string" || !password || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: "Unable to sign in with those credentials.",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: data.session,
    });
  } catch (error) {
    next(error);
  }
});

// Refresh an expired access token using the customer's current refresh token.
router.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = req.body?.refresh_token;
    if (typeof refreshToken !== "string" || !refreshToken.trim() || refreshToken.length > 4096) {
      return res
        .status(400)
        .json({ success: false, message: "A valid refresh token is required." });
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      return res
        .status(401)
        .json({ success: false, message: "Your sign-in session expired. Please sign in again." });
    }

    return res.json({ success: true, session: data.session });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// PASSWORD RESET: send an OTP using Nodemailer
// --------------------------------------------------

router.post("/forgot-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const genericMessage =
      "If an account exists for that email, a verification code has been sent.";

    const user = await findAuthUserByEmail(normalizedEmail);

    // Do not reveal whether an account exists.
    if (!user) {
      return res.status(200).json({
        success: true,
        message: genericMessage,
      });
    }

    const { data: pending, error: lookupError } = await supabaseAdmin
      .from("password_reset_otps")
      .select("last_sent_at")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (pending && !isResendAllowed(pending.last_sent_at)) {
      return res.status(200).json({
        success: true,
        message: genericMessage,
      });
    }

    const otp = generateOtp();
    const now = new Date().toISOString();

    const { error: saveError } = await supabaseAdmin.from("password_reset_otps").upsert(
      {
        email: normalizedEmail,
        otp_hash: hashOtp(normalizedEmail, otp),
        expires_at: getOtpExpiry(),
        attempts: 0,
        last_sent_at: now,
        created_at: now,
        reset_token_hash: null,
        reset_token_expires_at: null,
        reset_token_used_at: null,
      },
      { onConflict: "email" },
    );

    if (saveError) throw saveError;

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "Password reset code — Bhasi Gift Studio",
        text: `Your password reset code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
              <h2>Bhasi Gift Studio</h2>
              <p>Use this six-digit code to reset your password:</p>
              <p style="font-size:30px;font-weight:bold;letter-spacing:8px">${otp}</p>
              <p>This code expires in 10 minutes.</p>
              <p>If you did not request this, ignore this email.</p>
            </div>
          `,
      });
    } catch (emailError) {
      await supabaseAdmin.from("password_reset_otps").delete().eq("email", normalizedEmail);

      throw emailError;
    }

    return res.status(200).json({
      success: true,
      message: genericMessage,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// PASSWORD RESET: verify OTP and issue reset token
// --------------------------------------------------

router.post("/verify-reset-otp", otpVerifyLimiter, async (req, res, next) => {
  try {
    const { email, otp } = req.body || {};

    if (!validEmail(email) || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email and six-digit verification code.",
      });
    }

    const normalizedEmail = normalizeEmail(email);

    const { data: pending, error } = await supabaseAdmin
      .from("password_reset_otps")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) throw error;

    if (!pending || isOtpExpired(pending.expires_at)) {
      return res.status(400).json({
        success: false,
        message: "The code is invalid or expired. Request a new code.",
      });
    }

    if (!hasAttemptsRemaining(pending.attempts)) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect codes. Request a new code.",
      });
    }

    const suppliedHash = hashOtp(normalizedEmail, otp);

    if (!otpHashesMatch(pending.otp_hash, suppliedHash)) {
      const nextAttempts = pending.attempts + 1;

      const { error: updateError } = await supabaseAdmin
        .from("password_reset_otps")
        .update({ attempts: nextAttempts })
        .eq("email", normalizedEmail)
        .eq("otp_hash", pending.otp_hash);

      if (updateError) throw updateError;

      return res.status(400).json({
        success: false,
        message:
          nextAttempts >= 5
            ? "Too many incorrect codes. Request a new code."
            : "The verification code is incorrect.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Replace the OTP hash so that the code cannot be reused.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("password_reset_otps")
      .update({
        otp_hash: crypto.randomBytes(32).toString("hex"),
        reset_token_hash: hashResetToken(resetToken),
        reset_token_expires_at: expiresAt,
        reset_token_used_at: null,
      })
      .eq("email", normalizedEmail)
      .eq("otp_hash", pending.otp_hash)
      .select("email")
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "The code has already been used. Request a new code.",
      });
    }

    return res.status(200).json({
      success: true,
      resetToken,
      expiresInSeconds: 600,
      message: "Code verified. You can now choose a new password.",
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// PASSWORD RESET: update password with verified token
// --------------------------------------------------

router.post("/reset-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const { email, resetToken, password } = req.body || {};

    if (
      !validEmail(email) ||
      typeof resetToken !== "string" ||
      !/^[a-f0-9]{64}$/i.test(resetToken) ||
      !validPassword(password)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email, reset token, and password of 8–128 characters.",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const now = new Date().toISOString();

    // Atomically consume the verified reset token before updating the password.
    const { data: consumed, error: consumeError } = await supabaseAdmin
      .from("password_reset_otps")
      .update({
        reset_token_hash: null,
        reset_token_used_at: now,
      })
      .eq("email", normalizedEmail)
      .eq("reset_token_hash", hashResetToken(resetToken))
      .gt("reset_token_expires_at", now)
      .is("reset_token_used_at", null)
      .select("email")
      .maybeSingle();

    if (consumeError) throw consumeError;

    if (!consumed) {
      return res.status(400).json({
        success: false,
        message: "The reset session is invalid or expired. Verify a new code.",
      });
    }

    const user = await findAuthUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Unable to reset this account. Request a new code.",
      });
    }

    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
    });

    if (passwordError) throw passwordError;

    const { error: cleanupError } = await supabaseAdmin
      .from("password_reset_otps")
      .delete()
      .eq("email", normalizedEmail);

    if (cleanupError) {
      console.error("Password reset record cleanup failed.");
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully. Please log in.",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
