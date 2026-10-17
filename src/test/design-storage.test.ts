import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  designStorage,
  designStorageMessage,
  readSavedDesign,
  type SaveDesignInput,
} from "@/features/storefront/design-storage";
import { persistentCart, readCart, subtotal } from "@/features/storefront/cart-model";

const input: SaveDesignInput = {
  name: "For Mum",
  productId: "white-mug",
  variant: "White",
  artwork: "data:image/png;base64,aGVsbG8=",
  texts: [{ id: "text-1", text: "Mum", color: "#a92b48", size: 24, x: 50, y: 57 }],
};
beforeEach(async () => {
  vi.unstubAllGlobals();
  for (const design of await designStorage.list()) await designStorage.delete(design.id);
});
describe("Browser-only saved designs", () => {
  it("saves and restores independent photo and editable text with canonical product metadata", async () => {
    const saved = await designStorage.save(input);
    expect(saved.id).toBeTruthy();
    expect(saved.updatedAt).toBeGreaterThan(0);
    expect(await designStorage.get(saved.id)).toEqual(saved);
    expect(saved.artwork).toBe(input.artwork);
    expect(saved.texts).toEqual(input.texts);
    expect(await designStorage.list()).toEqual([saved]);
  });
  it("updates an existing design and preserves its ID and variant", async () => {
    const saved = await designStorage.save({ ...input, productId: "t-shirt", variant: "L" });
    const updated = await designStorage.save({
      ...saved,
      name: "Updated",
      texts: [
        {
          ...input.texts[0],
          id: "text-1",
          text: "New words",
          color: "#a92b48",
          size: 24,
          x: 50,
          y: 57,
        },
      ],
    });
    expect(updated.id).toBe(saved.id);
    expect(updated.variant).toBe("L");
    expect((await designStorage.list()).length).toBe(1);
    expect((await designStorage.get(saved.id))?.texts[0]?.text).toBe("New words");
  });
  it("saves editable text without artwork and artwork without text", async () => {
    const textOnly = await designStorage.save({ ...input, artwork: undefined });
    const photoOnly = await designStorage.save({ ...input, texts: [] });
    expect((await designStorage.get(textOnly.id))?.artwork).toBeUndefined();
    expect((await designStorage.get(textOnly.id))?.texts).toEqual(input.texts);
    expect((await designStorage.get(photoOnly.id))?.artwork).toBe(input.artwork);
    expect((await designStorage.get(photoOnly.id))?.texts).toEqual([]);
  });
  it("rejects a quota failure without writing a design or replacing the existing draft", async () => {
    const saved = await designStorage.save(input);
    const database = indexedDB;
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    });
    await expect(designStorage.save({ ...saved, name: "Not committed" })).rejects.toMatchObject({
      name: "QuotaExceededError",
    });
    vi.stubGlobal("indexedDB", database);
    expect(await designStorage.get(saved.id)).toEqual(saved);
    expect(await designStorage.list()).toEqual([saved]);
  });
  it("deletes only the selected record and leaves a safe missing cart reference", async () => {
    const first = await designStorage.save(input);
    const second = await designStorage.save(input);
    const rows = readCart(
      persistentCart([
        {
          key: "custom",
          productId: "white-mug",
          variant: "White",
          quantity: 2,
          designId: first.id,
          design: first,
        },
      ]),
    );
    await designStorage.delete(first.id);
    expect(await designStorage.get(first.id)).toBeUndefined();
    expect(await designStorage.get(second.id)).toEqual(second);
    expect(rows[0]?.designId).toBe(first.id);
    expect(rows[0]?.design).toBeUndefined();
    expect(subtotal(rows)).toBe(558);
  });
  it("stores only a design reference and metadata in localStorage, never image, text or price", async () => {
    const design = await designStorage.save(input);
    const raw = persistentCart([
      {
        key: "gift",
        productId: "white-mug",
        variant: "White",
        quantity: 1,
        designId: design.id,
        design,
      },
    ]);
    expect(JSON.parse(raw)).toEqual([
      { key: "gift", productId: "white-mug", variant: "White", quantity: 1, designId: design.id },
    ]);
    expect(raw).not.toContain(input.artwork);
    expect(raw).not.toContain("Mum");
    expect(subtotal(readCart(JSON.stringify([{ ...JSON.parse(raw)[0], price: 1 }])))).toBe(279);
  });
  it("rejects untrusted product, variant, image, text and positioning metadata", () => {
    const valid = { ...input, id: "d", updatedAt: 1 };
    expect(readSavedDesign(valid)).toBeDefined();
    for (const patch of [
      { productId: "unknown" },
      { variant: "XL" },
      { artwork: "data:text/html;base64,aGVsbG8=" },
      { texts: [{ ...input.texts[0], x: Infinity }] },
      { texts: [{ ...input.texts[0], color: "url(evil)" }] },
    ])
      expect(readSavedDesign({ ...valid, ...patch })).toBeUndefined();
    expect(readSavedDesign({ ...valid, price: 1 })).not.toHaveProperty("price");
  });
  it("rejects saving without any photo or nonempty text", async () => {
    await expect(designStorage.save({ ...input, artwork: undefined, texts: [] })).rejects.toThrow(
      "Invalid design",
    );
  });
  it("reports unavailable browser storage without manufacturing a saved result", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(designStorage.save(input)).rejects.toThrow("IndexedDB unavailable");
    expect(designStorageMessage(new Error("unavailable"))).toContain("Allow browser storage");
  });
  it("gives actionable quota feedback", () => {
    expect(designStorageMessage(new DOMException("Full", "QuotaExceededError"))).toContain(
      "Delete an unused saved design or choose a smaller photo",
    );
  });
});
