const test = require("node:test");
const assert = require("node:assert/strict");
const { isSafeTrackingUrl, isValidShipmentDate } = require("../src/services/shipmentValidation");

test("accepts official HTTP and HTTPS tracking links without embedded credentials", () => {
  assert.equal(isSafeTrackingUrl("https://courier.example/track/123"), true);
  assert.equal(isSafeTrackingUrl("http://courier.example/track/123"), true);
  assert.equal(isSafeTrackingUrl("https://user:pass@courier.example/track"), false);
  assert.equal(isSafeTrackingUrl("javascript:alert(1)"), false);
});

test("accepts real ISO shipment dates and rejects malformed or impossible dates", () => {
  assert.equal(isValidShipmentDate("2026-10-18"), true);
  assert.equal(isValidShipmentDate("2026-02-30"), false);
  assert.equal(isValidShipmentDate("18/10/2026"), false);
});
