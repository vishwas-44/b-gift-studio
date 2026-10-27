const test = require("node:test");
const assert = require("node:assert/strict");
const { csvField, spreadsheetSafe, toCsv } = require("../src/services/csvExport");

test("CSV escaping preserves commas, quotes, newlines and Unicode", () => {
  assert.equal(csvField('Meera, "M"\nPatel'), '"Meera, ""M""\nPatel"');
  const csv = toCsv(["Customer Name"], [["नमस्ते"]]);
  assert.ok(csv.startsWith("\ufeffCustomer Name\r\nनमस्ते\r\n"));
});

test("CSV neutralizes spreadsheet formulas but preserves numeric monetary values", () => {
  assert.equal(
    spreadsheetSafe('=HYPERLINK("https://example.test")'),
    '\'=HYPERLINK("https://example.test")',
  );
  assert.equal(spreadsheetSafe("+123"), "'+123");
  assert.equal(spreadsheetSafe(-279), "-279");
  assert.equal(csvField(279.5), "279.5");
});

test("one export row remains one CSV row when item values are joined", () => {
  const csv = toCsv(["Products", "Quantities"], [["Mug | Pillow", "1 | 2"]]);
  assert.equal(csv.split("\r\n").filter(Boolean).length, 2);
});
