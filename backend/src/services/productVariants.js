function normalizeVariant(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/Â(?=·)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

function canonicalVariant(variants, requested) {
  if (!Array.isArray(variants) || typeof requested !== "string") return null;
  return (
    variants.find(
      (variant) =>
        typeof variant === "string" && normalizeVariant(variant) === normalizeVariant(requested),
    ) || null
  );
}

module.exports = { normalizeVariant, canonicalVariant };
