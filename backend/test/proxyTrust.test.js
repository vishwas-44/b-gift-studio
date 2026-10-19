const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { resolveTrustProxyHops } = require("../src/services/proxyTrust");

test("uses one trusted app-facing hop on Render and preserves explicit non-Render config", () => {
  assert.equal(resolveTrustProxyHops({ RENDER: "true", TRUST_PROXY_HOPS: "0" }), 1);
  assert.equal(resolveTrustProxyHops({ RENDER: "false", TRUST_PROXY_HOPS: "2" }), 2);
  assert.equal(resolveTrustProxyHops({}), 0);
  assert.throws(() => resolveTrustProxyHops({ TRUST_PROXY_HOPS: "true" }), /non-negative integer/);
});

test("rate limiter keys requests by forwarded client IP behind the Render hop", async (t) => {
  const app = express();
  app.set("trust proxy", resolveTrustProxyHops({ RENDER: "true" }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 1,
      standardHeaders: false,
      legacyHeaders: false,
    }),
  );
  app.get("/", (req, res) => res.json({ ip: req.ip }));

  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;

  const first = await fetch(url, { headers: { "x-forwarded-for": "198.51.100.10" } });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ip: "198.51.100.10" });

  const repeated = await fetch(url, { headers: { "x-forwarded-for": "198.51.100.10" } });
  assert.equal(repeated.status, 429);

  const otherClient = await fetch(url, { headers: { "x-forwarded-for": "198.51.100.11" } });
  assert.equal(otherClient.status, 200);
});
