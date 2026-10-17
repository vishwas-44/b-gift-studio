import { getProduct } from "@/data/catalogue";
export interface TextLayer {
  id: string;
  text: string;
  color: string;
  size: number;
  x: number;
  y: number;
}
export interface DesignDraft {
  artwork?: string | undefined;
  texts: TextLayer[];
}
export interface CartItem {
  key: string;
  productId: string;
  variant: string;
  quantity: number;
  designId?: string | undefined;
  design?: DesignDraft | undefined;
}
export const CART_KEY = "bhasi-demo-cart-v1";
export function readCart(raw: string | null): CartItem[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return value.slice(0, 100).flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Partial<CartItem>;
      const product = typeof row.productId === "string" ? getProduct(row.productId) : undefined;
      if (
        !product ||
        typeof row.key !== "string" ||
        typeof row.variant !== "string" ||
        !product.variants.includes(row.variant) ||
        !Number.isInteger(row.quantity) ||
        typeof row.quantity !== "number" ||
        row.quantity < 1 ||
        row.quantity > 99
      )
        return [];
      // Artwork and text are hydrated only from validated IndexedDB records.
      const designId =
        typeof row.designId === "string" && row.designId.length > 0 && row.designId.length <= 100
          ? row.designId
          : undefined;
      return [
        {
          key: row.key,
          productId: product.id,
          variant: row.variant,
          quantity: row.quantity,
          ...(designId ? { designId } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}
export function subtotal(items: CartItem[]) {
  return items.reduce(
    (sum, item) => sum + (getProduct(item.productId)?.price || 0) * item.quantity,
    0,
  );
}
export function persistentCart(items: CartItem[]) {
  return JSON.stringify(
    items.map(({ key, productId, variant, quantity, designId }) => ({
      key,
      productId,
      variant,
      quantity,
      ...(designId ? { designId } : {}),
    })),
  );
}
