const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSafeTrackingUrl,
  isOfficialTrackingUrl,
  isValidShipmentDate,
} = require("../src/services/shipmentValidation");

test("accepts secure HTTPS tracking links without embedded credentials", () => {
  assert.equal(isSafeTrackingUrl("https://courier.example/track/123"), true);
  assert.equal(isSafeTrackingUrl("http://courier.example/track/123"), false);
  assert.equal(isSafeTrackingUrl("https://user:pass@courier.example/track"), false);
  assert.equal(isSafeTrackingUrl("javascript:alert(1)"), false);
});

test("restricts tracking links to the selected courier's official domain", () => {
  assert.equal(isOfficialTrackingUrl("https://www.fedex.com/fedextrack/123", "FedEx"), true);
  assert.equal(isOfficialTrackingUrl("https://fedex.com.attacker.example/track", "FedEx"), false);
  assert.equal(isOfficialTrackingUrl("https://dhl.com/track/123", "DHL"), true);
  assert.equal(isOfficialTrackingUrl("https://tracking.delhivery.com/123", "Other"), true);
  assert.equal(isOfficialTrackingUrl("https://example.com/track/123", "Other"), false);
});

test("accepts real ISO shipment dates and rejects malformed or impossible dates", () => {
  assert.equal(isValidShipmentDate("2026-10-18"), true);
  assert.equal(isValidShipmentDate("2026-02-30"), false);
  assert.equal(isValidShipmentDate("18/10/2026"), false);
});
