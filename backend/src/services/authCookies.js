const ACCESS_COOKIE = "bgs_access";
const REFRESH_COOKIE = "bgs_refresh";
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function cookieOptions({ path = "/api", maxAge } = {}) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path,
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== "string") return "";

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }

  return "";
}

function setSessionCookies(res, session) {
  const remainingAccessMs =
    typeof session.expires_at === "number"
      ? Math.max(0, session.expires_at * 1000 - Date.now())
      : typeof session.expires_in === "number"
        ? session.expires_in * 1000
        : undefined;

  res.cookie(ACCESS_COOKIE, session.access_token, cookieOptions({ maxAge: remainingAccessMs }));
  res.cookie(
    REFRESH_COOKIE,
    session.refresh_token,
    cookieOptions({ maxAge: REFRESH_COOKIE_MAX_AGE }),
  );
}

function clearSessionCookies(res) {
  res.clearCookie(ACCESS_COOKIE, cookieOptions());
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  cookieOptions,
  readCookie,
  setSessionCookies,
};
