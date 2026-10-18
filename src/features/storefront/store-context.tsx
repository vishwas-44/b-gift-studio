import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CART_KEY, LEGACY_CART_KEY, persistentCart, readCart, type CartItem } from "./cart-model";
import {
  designStorage,
  designStorageMessage,
  type SavedDesign,
  type SaveDesignInput,
} from "./design-storage";
import { fetchProductsFromApi, type StorefrontProduct } from "@/lib/api/storefront";
import { trackAnalyticsEvent } from "@/lib/api/analytics";
import {
  hasDesignSession,
  listRemoteDesigns,
  saveRemoteDesign,
  uploadDesignAsset,
  deleteRemoteDesign,
  getDesignAssetPreview,
  type RemoteDesign,
} from "@/lib/api/designs";

interface Store {
  cart: CartItem[];
  count: number;
  total: number;
  dark: boolean;
  ready: boolean;
  products: StorefrontProduct[];
  productsReady: boolean;
  productsError: string;
  refreshProducts: () => Promise<void>;
  getStoreProduct: (id: string) => StorefrontProduct | undefined;
  priceFor: (id: string) => number;
  stockFor: (id: string) => number | null;
  toggleTheme: () => void;
  add: (id: string, variant: string, quantity?: number, designId?: string) => void;
  update: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clearCart: () => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  designs: SavedDesign[];
  designsReady: boolean;
  designError: string;
  refreshDesigns: () => Promise<void>;
  saveDesign: (input: SaveDesignInput) => Promise<SavedDesign>;
  deleteDesign: (id: string) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

async function remoteToSavedDesign(
  row: RemoteDesign,
  products: StorefrontProduct[],
): Promise<SavedDesign | null> {
  const product = products.find((item) => item.backendId === row.product_id);

  if (!product || !row.design_data?.variant) return null;

  const assetIds = row.design_data.assetIds?.length
    ? row.design_data.assetIds
    : row.design_data.assetId
      ? [row.design_data.assetId]
      : [];
  const artworks = await Promise.all(
    assetIds.map((id) => getDesignAssetPreview(id).catch(() => "")),
  );

  return {
    id: row.id,
    name: row.design_name,
    productId: product.id,
    variant: row.design_data.variant,
    ...(artworks.some(Boolean) ? { artworks } : {}),
    ...(row.design_data.assetId ? { assetId: row.design_data.assetId } : {}),
    ...(assetIds.length ? { assetIds } : {}),
    remote: true,
    texts: row.design_data.texts ?? [],
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [productsError, setProductsError] = useState("");

  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [designsReady, setDesignsReady] = useState(false);
  const [designError, setDesignError] = useState("");
  const [remoteDesignIds, setRemoteDesignIds] = useState<Set<string>>(() => new Set());

  async function refreshProducts() {
    setProductsReady(false);

    try {
      const result = await fetchProductsFromApi();
      setProducts(result);
      setProductsError("");
    } catch (error: unknown) {
      setProductsError(
        error instanceof Error ? error.message : "Unable to load current product prices and stock.",
      );
    } finally {
      setProductsReady(true);
    }
  }

  async function refreshDesigns() {
    setDesignsReady(false);

    try {
      const localDesigns = await designStorage.list();

      if (!hasDesignSession()) {
        setDesigns(localDesigns);
        setRemoteDesignIds(new Set());
        setDesignError("");
        return;
      }

      const remoteRows = await listRemoteDesigns();

      const productRows = products.length > 0 ? products : await fetchProductsFromApi();

      if (products.length === 0) setProducts(productRows);

      const remoteIds = new Set(remoteRows.map((row) => row.id));

      const remoteDesigns = (
        await Promise.all(remoteRows.map((row) => remoteToSavedDesign(row, productRows)))
      ).filter((row): row is SavedDesign => row !== null);

      setDesigns([...remoteDesigns, ...localDesigns.filter((row) => !remoteIds.has(row.id))]);

      setRemoteDesignIds(remoteIds);
      setDesignError("");
    } catch (error: unknown) {
      setDesignError(
        error instanceof Error ? error.message : "Unable to synchronize saved designs.",
      );

      try {
        setDesigns(await designStorage.list());
      } catch {
        // Keep the current list if local storage is also unavailable.
      }
    } finally {
      setDesignsReady(true);
    }
  }

  useEffect(() => {
    void refreshProducts();
    void refreshDesigns();
  }, []);

  useEffect(() => {
    try {
      const currentCart = localStorage.getItem(CART_KEY);
      const legacyCart = currentCart === null ? localStorage.getItem(LEGACY_CART_KEY) : null;
      const restoredCart = readCart(currentCart ?? legacyCart);
      setCart(restoredCart);
      if (legacyCart !== null) {
        localStorage.setItem(CART_KEY, persistentCart(restoredCart));
        localStorage.removeItem(LEGACY_CART_KEY);
      }
      setDark(localStorage.getItem("bhasi-theme") === "dark");
    } catch {
      toast.info("Browser storage is unavailable. Your cart will last for this visit.");
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    try {
      localStorage.setItem(CART_KEY, persistentCart(cart));
    } catch {
      // Keep the in-memory cart usable.
    }
  }, [cart, ready]);

  useEffect(() => {
    if (!ready) return;

    document.documentElement.classList.toggle("dark", dark);

    try {
      localStorage.setItem("bhasi-theme", dark ? "dark" : "light");
    } catch {
      // Theme persistence is optional.
    }
  }, [dark, ready]);

  function getStoreProduct(id: string) {
    return products.find((product) => product.id === id || product.backendId === id);
  }

  function priceFor(id: string) {
    return getStoreProduct(id)?.price ?? 0;
  }

  function stockFor(id: string) {
    return getStoreProduct(id)?.stockQuantity ?? null;
  }

  async function saveDesign(input: SaveDesignInput) {
    try {
      // Guests can still save locally.
      if (!hasDesignSession()) {
        const saved = await designStorage.save(input);

        setDesigns((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);

        setDesignError("");
        return saved;
      }

      const product = getStoreProduct(input.productId);

      if (!product?.backendId) {
        throw new Error(
          "Product not found in the backend catalogue. Refresh products and try again.",
        );
      }

      const remoteRows = await listRemoteDesigns();

      const existingRemote = input.id ? remoteRows.find((row) => row.id === input.id) : undefined;

      let assetId = input.artworks?.length
        ? null
        : (input.assetId ?? existingRemote?.design_data?.assetId ?? null);
      let assetIds = input.assetIds ?? existingRemote?.design_data?.assetIds ?? [];

      if (input.artworks?.length) {
        assetIds = [];
        for (const [index, dataUrl] of input.artworks.entries()) {
          if (!dataUrl.startsWith("data:")) continue;
          const response = await fetch(dataUrl);
          if (!response.ok) throw new Error(`Unable to read photo ${index + 1}.`);
          const blob = await response.blob();
          if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
            throw new Error(`Photo ${index + 1} must be JPG, PNG, or WebP.`);
          }
          const extension =
            blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
          const uploaded = await uploadDesignAsset(
            new File([blob], `portrait-card-${index + 1}.${extension}`, { type: blob.type }),
            {
              assetType: input.assetType ?? "original_photo",
              ...(existingRemote ? { designId: existingRemote.id } : {}),
            },
          );
          assetIds.push(uploaded.id);
        }
      }

      // Upload photo bytes to private storage, never to design_data.
      if (input.artwork?.startsWith("data:")) {
        const response = await fetch(input.artwork);

        if (!response.ok) {
          throw new Error("Unable to read the selected design image.");
        }

        const blob = await response.blob();

        if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
          throw new Error("Use a JPG, PNG, or WebP image.");
        }

        const extension =
          blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";

        const file = new File([blob], `design-photo.${extension}`, { type: blob.type });

        const uploaded = await uploadDesignAsset(file, {
          assetType: input.assetType ?? "original_photo",
          ...(input.aiPrompt ? { aiPrompt: input.aiPrompt } : {}),
          ...(input.aiStyle ? { aiStyle: input.aiStyle } : {}),
          ...(existingRemote ? { designId: existingRemote.id } : {}),
        });

        assetId = uploaded.id;
      }

      if (assetIds.length) assetId = assetIds[0];

      const remote = await saveRemoteDesign({
        productId: product.backendId,
        designName: input.name.trim() || `${product.name} design`,
        variant: input.variant,
        assetId,
        assetIds,
        ...(existingRemote ? { id: existingRemote.id } : {}),
        ...(input.aiPrompt ? { aiPrompt: input.aiPrompt } : {}),
        texts: input.texts.map((layer) => ({
          id: layer.id,
          text: layer.text,
          color: layer.color,
          size: layer.size,
          x: layer.x,
          y: layer.y,
        })),
      });

      const saved: SavedDesign = {
        id: remote.id,
        name: remote.design_name,
        productId: input.productId,
        variant: input.variant,
        ...(input.artwork ? { artwork: input.artwork } : {}),
        ...(input.artworks ? { artworks: input.artworks } : {}),
        ...(assetId ? { assetId } : {}),
        ...(assetIds.length ? { assetIds } : {}),
        remote: true,
        texts: input.texts.map((layer) => ({ ...layer })),
        updatedAt: Date.parse(remote.updated_at) || Date.now(),
      };

      setRemoteDesignIds((ids) => new Set([...ids, saved.id]));

      setDesigns((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);

      setDesignError("");

      setCart((rows) =>
        rows.map((row) => {
          if (input.id && input.id !== saved.id && row.designId === input.id) {
            return {
              ...row,
              key: `design:${saved.id}`,
              designId: saved.id,
              productId: saved.productId,
              variant: saved.variant,
            };
          }
          return row.designId === saved.id
            ? { ...row, productId: saved.productId, variant: saved.variant }
            : row;
        }),
      );

      return saved;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to save this design.";

      setDesignError(message);
      throw new Error(message);
    }
  }

  async function deleteDesign(id: string) {
    try {
      if (remoteDesignIds.has(id)) {
        await deleteRemoteDesign(id);
        setRemoteDesignIds((ids) => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
      } else {
        await designStorage.delete(id);
      }

      setDesigns((rows) => rows.filter((row) => row.id !== id));
      setDesignError("");
      toast.success("Design deleted.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to delete this design.";

      setDesignError(message);
      throw new Error(message);
    }
  }

  function add(id: string, variant: string, quantity = 1, designId?: string) {
    const product = getStoreProduct(id);

    if (!product) {
      toast.error(
        productsReady
          ? "This product is unavailable. Please refresh the page."
          : "Product prices and stock are still loading. Please try again.",
      );
      return;
    }

    trackAnalyticsEvent("add_to_cart", `/products/${id}`);

    if (!product.variants.includes(variant)) {
      toast.error("Please select a valid product variant.");
      return;
    }

    if (product.stockQuantity === 0) {
      toast.error("This product is out of stock.");
      return;
    }

    const qty = Math.min(99, Math.max(1, Math.floor(quantity)));
    const key = designId ? `design:${designId}` : `${id}:${variant}`;
    const existing = cart.find((item) => item.key === key);
    const requestedQuantity = (existing?.quantity ?? 0) + qty;

    if (product.stockQuantity !== null && requestedQuantity > product.stockQuantity) {
      toast.error(`Only ${product.stockQuantity} item(s) are currently in stock.`);
      return;
    }

    setCart((items) => {
      const current = items.find((item) => item.key === key);

      if (current) {
        return items.map((item) =>
          item.key === key
            ? {
                ...item,
                quantity: Math.min(99, item.quantity + qty),
              }
            : item,
        );
      }

      return [
        ...items,
        {
          key,
          productId: id,
          variant,
          quantity: qty,
          ...(designId ? { designId } : {}),
        },
      ];
    });

    toast.success(`${product.name} added to your bag`, {
      action: {
        label: "View cart",
        onClick: () => setCartOpen(true),
      },
    });
  }

  function update(key: string, quantity: number) {
    const item = cart.find((row) => row.key === key);
    if (!item) return;

    const product = getStoreProduct(item.productId);
    const requested = Math.min(99, Math.max(1, Math.floor(quantity)));

    if (product?.stockQuantity === 0) {
      toast.error("This product is out of stock.");
      return;
    }

    if (product?.stockQuantity != null && requested > product.stockQuantity) {
      toast.error(`Only ${product.stockQuantity} item(s) are currently in stock.`);
      return;
    }

    setCart((items) =>
      items.map((row) => (row.key === key ? { ...row, quantity: requested } : row)),
    );
  }

  const hydratedCart = cart.map((item) => {
    const design = designs.find(
      (row) =>
        row.id === item.designId &&
        row.productId === item.productId &&
        row.variant === item.variant,
    );

    return { ...item, design };
  });

  const count = cart.reduce((total, item) => total + item.quantity, 0);

  const total = cart.reduce((sum, item) => sum + priceFor(item.productId) * item.quantity, 0);

  return (
    <StoreContext.Provider
      value={{
        cart: hydratedCart,
        ready,
        products,
        productsReady,
        productsError,
        refreshProducts,
        getStoreProduct,
        priceFor,
        stockFor,
        designs,
        designsReady,
        designError,
        refreshDesigns,
        saveDesign,
        deleteDesign,
        count,
        total,
        dark,
        toggleTheme: () => setDark((value) => !value),
        add,
        update,
        remove: (key) => {
          setCart((items) => items.filter((item) => item.key !== key));
          toast("Item removed");
        },
        clearCart: () => setCart([]),
        cartOpen,
        setCartOpen,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const store = useContext(StoreContext);

  if (!store) {
    throw new Error("StoreProvider is required");
  }

  return store;
}
