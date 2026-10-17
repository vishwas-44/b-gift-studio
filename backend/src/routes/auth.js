
const express = require("express");
const supabase = require("../supabase");

const router = express.Router();

router.post("/signup", async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email and a password of 8–128 characters.",
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name:
            typeof fullName === "string" ? fullName.trim().slice(0, 100) : "",
        },
      },
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Sign-up submitted. Check your email if confirmation is required.",
      user: data.user
        ? { id: data.user.id, email: data.user.email }
        : null,
      session: data.session,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
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
      user: { id: data.user.id, email: data.user.email },
      session: data.session,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/resend-confirmation", async (req, res, next) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: "http://localhost:3000",
      },
    });

    if (error) {
      console.error("Resend confirmation failed:", error.message);

      return res.status(400).json({
        success: false,
        message: "Could not resend confirmation email. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "If confirmation is needed, a new email has been requested.",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
