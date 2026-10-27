function spreadsheetSafe(value) {
  if (typeof value === "number") return String(value);
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvField(value, { protectFormula = true } = {}) {
  const text = protectFormula ? spreadsheetSafe(value) : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(headers, rows) {
  return `\ufeff${headers.map((header) => csvField(header, { protectFormula: false })).join(",")}\r\n${rows
    .map((row) => row.map((value) => csvField(value)).join(","))
    .join("\r\n")}\r\n`;
}

module.exports = { csvField, spreadsheetSafe, toCsv };
