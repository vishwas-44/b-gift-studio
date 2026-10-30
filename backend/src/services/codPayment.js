function codPaymentFailure(error) {
  if (["PGRST202", "PGRST204", "PGRST205", "42703", "42P01"].includes(error?.code)) {
    return {
      status: 503,
      message:
        "COD payment database setup is incomplete. Apply supabase/migrations/20261018120000_cod_payment_confirmation.sql, then retry.",
    };
  }
  if (error?.code === "P0002") return { status: 404, message: "Order not found." };
  if (["P0001", "22023"].includes(error?.code)) {
    return { status: 409, message: error.message || "COD payment cannot be confirmed." };
  }
  return { status: 500, message: "Unable to confirm COD payment." };
}

async function confirmCodPayment(supabaseAdmin, orderId, adminId) {
  const { data, error } = await supabaseAdmin.rpc("admin_confirm_cod_payment", {
    p_order_id: orderId,
    p_admin_id: adminId,
  });
  if (error) return { ok: false, ...codPaymentFailure(error), error };
  return { ok: true, order: data };
}

module.exports = { codPaymentFailure, confirmCodPayment };
