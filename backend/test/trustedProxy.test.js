const test = require("node:test");
const assert = require("node:assert/strict");
const { getTrustedProxyHops } = require("../src/services/trustedProxy");

test("defaults to one trusted proxy hop in production and none in development", () => {
  assert.equal(getTrustedProxyHops({ nodeEnv: "production" }), 1);
  assert.equal(getTrustedProxyHops({ nodeEnv: "development" }), 0);
});

test("accepts explicit trusted proxy hop counts", () => {
  assert.equal(getTrustedProxyHops({ nodeEnv: "production", configuredHops: "1" }), 1);
  assert.equal(getTrustedProxyHops({ nodeEnv: "development", configuredHops: "0" }), 0);
});

test("rejects untrusted or invalid production proxy configuration", () => {
  for (const configuredHops of ["0", "-1", "true", "1.5", "invalid"]) {
    assert.throws(
      () => getTrustedProxyHops({ nodeEnv: "production", configuredHops }),
      /TRUST_PROXY_HOPS must be a positive integer in production/,
    );
  }
});
