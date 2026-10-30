function getTrustedProxyHops({
  nodeEnv = process.env.NODE_ENV,
  configuredHops = process.env.TRUST_PROXY_HOPS,
} = {}) {
  const isProduction = nodeEnv === "production";
  if (configuredHops === undefined) return isProduction ? 1 : 0;

  const hops = Number(configuredHops);
  if (!Number.isSafeInteger(hops) || hops < 0 || (isProduction && hops === 0)) {
    throw new Error(
      isProduction
        ? "TRUST_PROXY_HOPS must be a positive integer in production."
        : "TRUST_PROXY_HOPS must be a non-negative integer.",
    );
  }

  return hops;
}

module.exports = { getTrustedProxyHops };
