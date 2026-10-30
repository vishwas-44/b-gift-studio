const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  readCookie,
  setSessionCookies,
} = require("../src/services/authCookies");

test("reads and decodes the requested cookie without matching substrings", () => {
  const req = {
    headers: { cookie: "other_bgs_access=wrong; bgs_access=token%2Bvalue; bgs_refresh=refresh" },
  };

  assert.equal(readCookie(req, ACCESS_COOKIE), "token+value");
  assert.equal(readCookie(req, REFRESH_COOKIE), "refresh");
  assert.equal(readCookie(req, "missing"), "");
});

test("sets production session tokens in Secure cross-site HttpOnly cookies", () => {
  const calls = [];
  const res = {
    cookie: (...args) => calls.push(args),
  };
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    setSessionCookies(res, {
      access_token: "access",
      refresh_token: "refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }

  assert.deepEqual(
    calls.map(([name, value]) => [name, value]),
    [
      [ACCESS_COOKIE, "access"],
      [REFRESH_COOKIE, "refresh"],
    ],
  );
  for (const [, , options] of calls) {
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, "none");
    assert.equal(options.path, "/api");
  }
});

test("uses Lax cookies for local development", () => {
  const calls = [];
  const res = {
    cookie: (...args) => calls.push(args),
  };
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV;

  try {
    setSessionCookies(res, {
      access_token: "access",
      refresh_token: "refresh",
    });
  } finally {
    if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
  }

  for (const [, , options] of calls) {
    assert.equal(options.secure, false);
    assert.equal(options.sameSite, "lax");
  }
});

test("clears both production cookies with matching scope and security attributes", () => {
  const calls = [];
  const res = {
    clearCookie: (...args) => calls.push(args),
  };
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    clearSessionCookies(res);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }

  assert.deepEqual(
    calls.map(([name]) => name),
    [ACCESS_COOKIE, REFRESH_COOKIE],
  );
  for (const [, options] of calls) {
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, "none");
    assert.equal(options.path, "/api");
  }
});
