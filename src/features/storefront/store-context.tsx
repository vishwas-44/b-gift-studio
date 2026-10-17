import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CART_KEY, persistentCart, readCart, subtotal, type CartItem } from "./cart-model";
import { getProduct } from "@/data/catalogue";
import {
  designStorage,
  designStorageMessage,
  type SavedDesign,
  type SaveDesignInput,
} from "./design-storage";
interface Store {
  cart: CartItem[];
  count: number;
  total: number;
  dark: boolean;
  ready: boolean;
  toggleTheme: () => void;
  add: (id: string, variant: string, quantity?: number, designId?: string) => void;
  update: (key: string, quantity: number) => void;
  remove: (key: string) => void;
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
export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [designsReady, setDesignsReady] = useState(false);
  const [designError, setDesignError] = useState("");
  async function refreshDesigns() {
    setDesignsReady(false);
    try {
      setDesigns(await designStorage.list());
      setDesignError("");
    } catch (error) {
      const message = designStorageMessage(error);
      setDesignError(message);
    } finally {
      setDesignsReady(true);
    }
  }
  useEffect(() => {
    void refreshDesigns();
  }, []);
  useEffect(() => {
    try {
      setCart(readCart(localStorage.getItem(CART_KEY)));
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
      /* In-memory cart remains usable when storage is blocked. */
    }
  }, [cart, ready]);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("bhasi-theme", dark ? "dark" : "light");
    } catch {
      /* Optional preference. */
    }
  }, [dark, ready]);
  async function saveDesign(input: SaveDesignInput) {
    try {
      const saved = await designStorage.save(input);
      setDesigns((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
      setDesignError("");
      setCart((rows) =>
        rows.map((row) =>
          row.designId === saved.id
            ? { ...row, productId: saved.productId, variant: saved.variant }
            : row,
        ),
      );
      return saved;
    } catch (error) {
      const message = designStorageMessage(error);
      setDesignError(message);
      throw new Error(message);
    }
  }
  async function deleteDesign(id: string) {
    try {
      await designStorage.delete(id);
      setDesigns((rows) => rows.filter((row) => row.id !== id));
      setDesignError("");
      toast("Design deleted from this browser. Bag references now show a missing draft.");
    } catch (error) {
      const message = designStorageMessage(error);
      setDesignError(message);
      throw new Error(message);
    }
  }
  function add(id: string, variant: string, quantity = 1, designId?: string) {
    const product = getProduct(id);
    if (!product || !product.variants.includes(variant)) return;
    const qty = Math.min(99, Math.max(1, Math.floor(quantity)));
    const key = designId ? `design:${designId}` : `${id}:${variant}`;
    setCart((items) => {
      const existing = items.find((item) => item.key === key);
      return existing
        ? items.map((item) =>
            item.key === key ? { ...item, quantity: Math.min(99, item.quantity + qty) } : item,
          )
        : [...items, { key, productId: id, variant, quantity: qty, designId }];
    });
    toast.success(`${product.name} added to your demo cart`, {
      action: { label: "View cart", onClick: () => setCartOpen(true) },
    });
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
  return (
    <StoreContext.Provider
      value={{
        cart: hydratedCart,
        ready,
        designs,
        designsReady,
        designError,
        refreshDesigns,
        saveDesign,
        deleteDesign,
        count: cart.reduce((n, i) => n + i.quantity, 0),
        total: subtotal(cart),
        dark,
        toggleTheme: () => setDark((v) => !v),
        add,
        update: (key, quantity) =>
          setCart((items) =>
            items.map((item) =>
              item.key === key
                ? { ...item, quantity: Math.min(99, Math.max(1, Math.floor(quantity))) }
                : item,
            ),
          ),
        remove: (key) => {
          setCart((items) => items.filter((item) => item.key !== key));
          toast("Item removed");
        },
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
  if (!store) throw new Error("StoreProvider is required");
  return store;
}
