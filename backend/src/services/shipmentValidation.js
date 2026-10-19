function isValidShipmentDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isSafeTrackingUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isOfficialTrackingUrl(value, courierCompany) {
  if (!isSafeTrackingUrl(value)) return false;
  const hostname = new URL(value).hostname.toLowerCase();
  const domains =
    courierCompany === "FedEx"
      ? ["fedex.com"]
      : courierCompany === "DHL"
        ? ["dhl.com"]
        : [
            "delhivery.com",
            "bluedart.com",
            "indiapost.gov.in",
            "shiprocket.in",
            "xpressbees.com",
            "ecomexpress.in",
            "dtdc.in",
          ];
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

module.exports = { isValidShipmentDate, isSafeTrackingUrl, isOfficialTrackingUrl };
