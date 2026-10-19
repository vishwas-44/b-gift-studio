import { afterEach, describe, expect, it, vi } from "vitest";
import { products, filterProducts } from "@/data/catalogue";
import { readCart, subtotal, persistentCart } from "@/features/storefront/cart-model";
import { calculateSubtotal } from "@/features/storefront/pricing";
import { fetchProductsFromApi } from "@/lib/api/storefront";

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("Canonical gift prices", () => {
  it.each([
    ["white-mug", 279],
    ["sipper", 759],
    ["pillow", 449],
    ["t-shirt", 349],
    ["magic-mug", 449],
    ["portrait-cards", 149],
  ])("%s costs ₹%i", (id, price) => {
    expect(products.find((p) => p.id === id)?.price).toBe(price);
  });
  it("portrait cards contain 20 photos", () => {
    expect(products.find((p) => p.id === "portrait-cards")?.variants).toEqual(["Set of 20 photos"]);
  });
});
describe("checkout estimates from the current API catalogue prices", () => {
  it("uses product API unit prices in the estimate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            products: [
              {
                id: "sipper-backend-id",
                name: "600 ml still sipper",
                slug: "still-sipper-600ml",
                price: "759.00",
                currency: "INR",
                stock_quantity: 10,
                is_active: true,
              },
              {
                id: "magic-mug-backend-id",
                name: "Magic mug",
                slug: "magic-mug",
                price: "449.00",
                currency: "INR",
                stock_quantity: 10,
                is_active: true,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const liveProducts = await fetchProductsFromApi();
    const sipper = liveProducts.find((product) => product.id === "sipper")!;
    const magicMug = liveProducts.find((product) => product.id === "magic-mug")!;

    expect(
      calculateSubtotal([
        { unitPrice: sipper.price, quantity: 1 },
        { unitPrice: magicMug.price, quantity: 1 },
      ]),
    ).toBe(1208);
  });

  it("multiplies each current unit price by quantity without shipping or tax", () => {
    expect(
      calculateSubtotal([
        { unitPrice: 759, quantity: 2 },
        { unitPrice: 449, quantity: 3 },
      ]),
    ).toBe(2865);
  });
});
describe("Catalogue and local bag", () => {
  it("search and category filters combine", () => {
    expect(filterProducts({ search: "magic", category: "Mugs" }).map((p) => p.id)).toEqual([
      "magic-mug",
    ]);
  });
  it("sorts using canonical prices", () => {
    expect(filterProducts({ sort: "price-asc" }).map((p) => p.price)).toEqual([
      149, 279, 349, 449, 449, 759,
    ]);
  });
  it("reads back a valid persisted item", () => {
    expect(
      readCart(
        JSON.stringify([{ key: "m", productId: "white-mug", variant: "White", quantity: 2 }]),
      ),
    ).toEqual([{ key: "m", productId: "white-mug", variant: "White", quantity: 2 }]);
  });
  it("rejects malformed, unknown and invalid quantity rows", () => {
    expect(readCart("{")).toEqual([]);
    expect(
      readCart(
        JSON.stringify([
          { key: "a", productId: "missing", variant: "White", quantity: 1 },
          { key: "b", productId: "white-mug", variant: "White", quantity: -1 },
        ]),
      ),
    ).toEqual([]);
  });
  it("calculates subtotal without invented tax or shipping", () => {
    expect(
      subtotal([
        { key: "a", productId: "white-mug", variant: "White", quantity: 2 },
        { key: "b", productId: "portrait-cards", variant: "Set of 20 photos", quantity: 1 },
      ]),
    ).toBe(707);
  });
  it("does not persist artwork or editable text", () => {
    const saved = persistentCart([
      {
        key: "a",
        productId: "white-mug",
        variant: "White",
        quantity: 1,
        design: {
          artwork: "sensitive-photo",
          texts: [{ id: "t", text: "Private name", color: "#000000", size: 24, x: 50, y: 50 }],
        },
      },
    ]);
    expect(saved).not.toContain("sensitive-photo");
    expect(saved).not.toContain("Private name");
    expect(readCart(saved)).toHaveLength(1);
  });
});
