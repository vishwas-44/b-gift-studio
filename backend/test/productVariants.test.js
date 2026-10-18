const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalVariant } = require("../src/services/productVariants");

test("variant matching accepts the storefront middle-dot encoding and returns backend canonical text", () => {
  assert.equal(canonicalVariant(["White · 600 ml"], "White Â· 600 ml"), "White · 600 ml");
  assert.equal(canonicalVariant(["White Â· 600 ml"], "White · 600 ml"), "White Â· 600 ml");
});

test("variant matching still rejects values outside the backend catalogue", () => {
  assert.equal(canonicalVariant(["S", "M", "L", "XL"], "XXL"), null);
});
