const supabaseAdmin = require("../supabaseAdmin");
const requireAuth = require("./requireAuth");

async function checkAdminRole(req, res, next) {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error("Admin role lookup failed:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to verify administrator permissions.",
      });
    }

    if (!profile || profile.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Administrator access required.",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, (authError) => {
    if (authError) {
      return next(authError);
    }

    if (res.headersSent) {
      return;
    }

    return checkAdminRole(req, res, next);
  });
}

module.exports = requireAdmin;
