function requireTrustedOrigin(allowedOrigin) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origin !== allowedOrigin) {
      return res.status(403).json({ success: false, message: "Origin is not allowed." });
    }

    const isUnsafeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
    const hasSessionCookie = /(?:^|;)\s*bgs_(?:access|refresh)=/.test(req.headers.cookie || "");
    if (isUnsafeMethod && hasSessionCookie && origin !== allowedOrigin) {
      return res
        .status(403)
        .json({ success: false, message: "A valid request origin is required." });
    }

    return next();
  };
}

module.exports = requireTrustedOrigin;
