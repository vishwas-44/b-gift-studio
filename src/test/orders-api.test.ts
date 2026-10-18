import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder, type DeliveryAddress } from "@/lib/api/orders";

const address: DeliveryAddress = {
  fullName: "A Customer",
  phone: "+911234567890",
  addressLine1: "12 Example Road",
  addressLine2: "",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  country: "India",
};

const order = {
  id: "a3beef71-8109-4f91-a400-2a823a254201",
  order_number: "BGS-20261018-1234ABCD",
  status: "pending",
  payment_status: "unpaid",
  payment_method: "test_unpaid",
  subtotal: 279,
  shipping_fee: 0,
  tax_amount: 0,
  total_amount: 279,
  currency: "INR",
  created_at: "2026-10-18T00:00:00.000Z",
};

beforeEach(() => {
  localStorage.setItem(
    "bhasi-auth-session",
    JSON.stringify({ access_token: "valid-test-session" }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("checkout API client", () => {
  it("returns only a server-confirmed unpaid order", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true, order }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createOrder({
      shippingAddress: address,
      items: [{ productId: "a3beef71-8109-4f91-a400-2a823a254202", variant: "White", quantity: 1 }],
    });
    expect(result).toEqual(order);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.items[0]).toEqual({
      productId: "a3beef71-8109-4f91-a400-2a823a254202",
      variant: "White",
      quantity: 1,
    });
    expect(body.shippingAddress).toEqual(address);
  });

  it("surfaces stock conflicts without returning an order", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: false, message: "Insufficient stock for White Mug." }),
            { status: 409 },
          ),
        ),
    );
    await expect(createOrder({ shippingAddress: address, items: [] })).rejects.toThrow(
      "Insufficient stock",
    );
  });

  it("rejects unauthenticated checkout before making a request", async () => {
    localStorage.clear();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createOrder({ shippingAddress: address, items: [] })).rejects.toThrow("Sign in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat a failed submission as an order confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: "Unable to place this order." }), {
          status: 500,
        }),
      ),
    );
    await expect(createOrder({ shippingAddress: address, items: [] })).rejects.toThrow(
      "Unable to place this order.",
    );
  });

  it("rejects any response that claims payment instead of unpaid test status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: true, order: { ...order, payment_status: "paid" } }),
            { status: 201 },
          ),
        ),
    );
    await expect(createOrder({ shippingAddress: address, items: [] })).rejects.toThrow(
      "did not confirm an unpaid order",
    );
  });
});
