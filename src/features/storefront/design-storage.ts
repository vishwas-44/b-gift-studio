import { getProduct } from "@/data/catalogue";
import type { DesignDraft, TextLayer } from "./cart-model";

export interface SavedDesign extends DesignDraft {
  id: string;
  name: string;
  productId: string;
  variant: string;
  updatedAt: number;
  /** Remote private-storage reference; signed preview URLs are memory-only. */
  assetId?: string;
  assetIds?: string[];
  remote?: boolean;
}
export type SaveDesignInput = Omit<SavedDesign, "id" | "updatedAt"> & {
  id?: string | undefined;
  assetType?: "original_photo" | "generated_image" | "other";
  aiPrompt?: string;
  aiStyle?: string;
};
const DATABASE = "bhasi-local-designs-v1";
const STORE = "designs";
const MAX_ARTWORK_LENGTH = 12 * 1024 * 1024;

function validText(value: unknown): value is TextLayer {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<TextLayer>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    row.id.length <= 100 &&
    typeof row.text === "string" &&
    row.text.length <= 150 &&
    typeof row.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(row.color) &&
    typeof row.size === "number" &&
    Number.isFinite(row.size) &&
    row.size >= 12 &&
    row.size <= 60 &&
    typeof row.x === "number" &&
    Number.isFinite(row.x) &&
    row.x >= 10 &&
    row.x <= 90 &&
    typeof row.y === "number" &&
    Number.isFinite(row.y) &&
    row.y >= 10 &&
    row.y <= 90
  );
}
export function readSavedDesign(value: unknown): SavedDesign | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Partial<SavedDesign>;
  const product = typeof row.productId === "string" ? getProduct(row.productId) : undefined;
  if (
    !product ||
    typeof row.id !== "string" ||
    !row.id.length ||
    row.id.length > 100 ||
    typeof row.name !== "string" ||
    !row.name.trim() ||
    row.name.length > 80 ||
    typeof row.variant !== "string" ||
    !product.variants.includes(row.variant) ||
    typeof row.updatedAt !== "number" ||
    !Number.isFinite(row.updatedAt) ||
    row.updatedAt < 0 ||
    !Array.isArray(row.texts) ||
    row.texts.length > 10 ||
    !row.texts.every(validText) ||
    new Set(row.texts.map((t) => t.id)).size !== row.texts.length
  )
    return undefined;
  if (
    row.artwork !== undefined &&
    (typeof row.artwork !== "string" ||
      row.artwork.length > MAX_ARTWORK_LENGTH ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(row.artwork))
  )
    return undefined;
  if (
    row.artworks !== undefined &&
    (!Array.isArray(row.artworks) ||
      row.artworks.length > 20 ||
      !row.artworks.every(
        (image) =>
          typeof image === "string" &&
          image.length <= MAX_ARTWORK_LENGTH &&
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image),
      ))
  )
    return undefined;
  if (!row.artwork && !row.artworks?.length && !row.texts.some((t) => t.text.trim()))
    return undefined;
  return {
    id: row.id,
    name: row.name.trim(),
    productId: product.id,
    variant: row.variant,
    updatedAt: row.updatedAt,
    artwork: row.artwork,
    ...(row.artworks ? { artworks: [...row.artworks] } : {}),
    texts: row.texts.map(({ id, text, color, size, x, y }) => ({ id, text, color, size, x, y })),
  };
}
export function designStorageMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "QuotaExceededError")
    return "Browser storage is full. Delete an unused saved design or choose a smaller photo, then try again.";
  return "Saved designs could not be opened or saved. Allow browser storage or leave private browsing, then retry. Keep this page open to retain your current draft.";
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE, 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other studio tabs and retry"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || request.error || new Error("Storage transaction aborted"));
      };
      tx.onerror = () => {
        /* Abort handler reports failure; never claim a save before commit. */
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}
export const designStorage = {
  async list(): Promise<SavedDesign[]> {
    const rows: unknown[] = await transaction("readonly", (store) => store.getAll());
    return rows
      .flatMap((row) => {
        const design = readSavedDesign(row);
        return design ? [design] : [];
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async get(id: string): Promise<SavedDesign | undefined> {
    return readSavedDesign(await transaction("readonly", (store) => store.get(id)));
  },
  async save(input: SaveDesignInput): Promise<SavedDesign> {
    const design = readSavedDesign({
      ...input,
      id: input.id || crypto.randomUUID(),
      updatedAt: Date.now(),
    });
    if (!design)
      throw new Error("Invalid design. Add a photo or text and select a valid product variant.");
    await transaction("readwrite", (store) => store.put(design));
    return design;
  },
  async delete(id: string): Promise<void> {
    await transaction("readwrite", (store) => store.delete(id));
  },
};
