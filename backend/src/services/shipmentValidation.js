function isValidShipmentDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isSafeTrackingUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

module.exports = { isValidShipmentDate, isSafeTrackingUrl };
