const test = require("node:test");
const assert = require("node:assert/strict");

process.env.RESEND_API_KEY ||= "test_key";
process.env.EMAIL_FROM ||= "Bhasi Gift Studio <no-reply@example.com>";

const { escapeHtml, notifyNewFeedback } = require("../src/services/adminNotifications");

test("admin notification HTML escapes customer-controlled feedback text", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("missing notification recipient skips delivery without failing a persisted feedback flow", async () => {
  const originalRecipient = process.env.ADMIN_NOTIFICATION_EMAIL;
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  const result = await notifyNewFeedback({
    feedback: {
      id: "feedback-id",
      category: "general",
      rating: 5,
      status: "new",
      created_at: "2026-10-27T00:00:00.000Z",
      message: "Everything was great.",
    },
  });
  if (originalRecipient === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
  else process.env.ADMIN_NOTIFICATION_EMAIL = originalRecipient;
  assert.deepEqual(result, { sent: false, reason: "not_configured" });
});
