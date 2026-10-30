const supabase = require("../supabase");
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  readCookie,
  setSessionCookies,
} = require("../services/authCookies");

async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const accessToken = bearerToken || readCookie(req, ACCESS_COOKIE);
    const refreshToken = readCookie(req, REFRESH_COOKIE);

    if (!accessToken && !refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    let token = accessToken;
    let { data, error } = token ? await supabase.auth.getUser(token) : { data: null, error: true };

    if ((error || !data?.user) && refreshToken) {
      const refreshed = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (!refreshed.error && refreshed.data.session) {
        token = refreshed.data.session.access_token;
        data = { user: refreshed.data.user };
        error = null;
        setSessionCookies(res, refreshed.data.session);
      }
    }

    if (error || !data?.user) {
      clearSessionCookies(res);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session.",
      });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
    };
    req.authToken = token;

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireAuth;
