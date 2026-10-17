import { describe, expect, it } from "vitest";
import { products, filterProducts } from "@/data/catalogue";
import { readCart, subtotal, persistentCart } from "@/features/storefront/cart-model";
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
