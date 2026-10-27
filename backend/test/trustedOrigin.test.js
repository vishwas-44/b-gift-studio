const test = require("node:test");
const assert = require("node:assert/strict");
const requireTrustedOrigin = require("../src/middleware/requireTrustedOrigin");

function runMiddleware(request, allowedOrigin = "https://shop.example.test") {
  let statusCode = 200;
  let responseBody;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  requireTrustedOrigin(allowedOrigin)(request, res, () => {
    nextCalled = true;
  });

  return { statusCode, responseBody, nextCalled };
}

test("rejects foreign browser origins", () => {
  const result = runMiddleware({
    method: "GET",
    headers: { origin: "https://attacker.example.test" },
  });

  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalled, false);
});

test("rejects unsafe cookie-authenticated requests without the exact storefront origin", () => {
  for (const origin of [undefined, "https://evil.example.test"]) {
    const result = runMiddleware({
      method: "POST",
      headers: { origin, cookie: "bgs_access=opaque" },
    });

    assert.equal(result.statusCode, 403);
    assert.equal(result.nextCalled, false);
  }
});

test("accepts same-origin cookie requests and unauthenticated non-browser requests", () => {
  const sameOrigin = runMiddleware({
    method: "PATCH",
    headers: { origin: "https://shop.example.test", cookie: "bgs_refresh=opaque" },
  });
  const noCookieNoOrigin = runMiddleware({ method: "POST", headers: {} });

  assert.equal(sameOrigin.nextCalled, true);
  assert.equal(noCookieNoOrigin.nextCalled, true);
});
