function resolveTrustProxyHops(environment = process.env) {
  // Render's public web service forwards requests through its load balancer.
  // That proxy is the single app-facing hop, regardless of a stale env value.
  if (environment.RENDER === "true") return 1;

  const configured = environment.TRUST_PROXY_HOPS;
  const hops = Number(configured || 0);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
  }
  return hops;
}

module.exports = { resolveTrustProxyHops };
