const test = require("node:test");
const assert = require("node:assert/strict");
const { codPaymentFailure, confirmCodPayment } = require("../src/services/codPayment");

const orderId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";

test("an authorized admin confirmation calls the atomic COD RPC with server-derived identifiers", async () => {
  let call;
  const client = {
    rpc: async (name, params) => {
      call = { name, params };
      return { data: { id: orderId, payment_status: "paid", payment_method: "cash_on_delivery" } };
    },
  };
  const result = await confirmCodPayment(client, orderId, adminId);
  assert.equal(result.ok, true);
  assert.equal(result.order.payment_status, "paid");
  assert.deepEqual(call, {
    name: "admin_confirm_cod_payment",
    params: { p_order_id: orderId, p_admin_id: adminId },
  });
});

test("COD confirmation maps missing orders, non-COD orders, and repeat/concurrent confirmations safely", () => {
  assert.deepEqual(codPaymentFailure({ code: "P0002" }), {
    status: 404,
    message: "Order not found.",
  });
  assert.equal(
    codPaymentFailure({
      code: "22023",
      message: "Only Cash on Delivery orders can be confirmed here.",
    }).status,
    409,
  );
  assert.equal(
    codPaymentFailure({ code: "P0001", message: "This COD payment has already been confirmed." })
      .status,
    409,
  );
});

test("COD confirmation does not report database errors as payment success", async () => {
  const result = await confirmCodPayment(
    { rpc: async () => ({ error: { code: "P0001", message: "Already paid" } }) },
    orderId,
    adminId,
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("the migration keeps analytics based on paid authoritative orders and makes COD collection one-way", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const migration = fs.readFileSync(
    path.join(__dirname, "../../supabase/migrations/20261018120000_cod_payment_confirmation.sql"),
    "utf8",
  );
  const analytics = fs.readFileSync(
    path.join(__dirname, "../../supabase/migrations/20261018030000_traction_analytics.sql"),
    "utf8",
  );
  assert.match(migration, /for update/i);
  assert.match(migration, /payment_status <> 'unpaid'/i);
  assert.match(migration, /payment_method <> 'cash_on_delivery'/i);
  assert.match(analytics, /sum\(total_amount\) filter \(where payment_status = 'paid'\)/i);
  assert.match(analytics, /count\(\*\) filter \(where payment_status = 'paid'\)/i);
});
