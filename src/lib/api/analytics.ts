const SESSION_KEY = "bhasi-analytics-session";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function anonymousSessionId(): string | null {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
    return sessionId;
  } catch {
    return null;
  }
}

export function trackAnalyticsEvent(
  eventType: "page_view" | "product_view" | "add_to_cart" | "checkout_started",
  pagePath: string,
) {
  const sessionId = anonymousSessionId();
  if (!sessionId) return;
  void fetch(`${API_BASE_URL}/api/analytics/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, eventType, pagePath }),
    keepalive: true,
  }).catch(() => {
    // Analytics are optional and never block shopping or checkout.
  });
}
