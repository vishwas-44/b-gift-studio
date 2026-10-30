import {
  filterProducts,
  getProduct,
  products as localProducts,
  type CatalogueFilter,
  type Product,
} from "@/data/catalogue";
import { API_BASE_URL } from "./base-url";

type ApiProduct = {
  id: string;
  name: string;
  slug: string;
  price: number | string;
  currency: string;
  description?: string | null;
  image_url?: string | null;
  stock_quantity: number | null;
  is_active: boolean;
};

export type StorefrontProduct = Product & {
  backendId: string;
  stockQuantity: number | null;
  currencyCode: string;
  imageUrl: string | null;
};

function normalizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function matchLocalProduct(apiProduct: ApiProduct): Product | undefined {
  const apiName = normalizeName(apiProduct.name);

  return localProducts.find((product) => {
    const localName = normalizeName(product.name);

    if (apiName.startsWith("portraitcards")) {
      return product.id === "portrait-cards";
    }

    return localName === apiName || normalizeName(apiProduct.slug) === normalizeName(product.id);
  });
}

export async function fetchProductsFromApi(
  filters: CatalogueFilter = {},
): Promise<StorefrontProduct[]> {
  const response = await fetch(`${API_BASE_URL}/api/products`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to load products (HTTP ${response.status}).`);
  }

  const payload: {
    success: boolean;
    products: ApiProduct[];
  } = await response.json();

  if (!payload.success || !Array.isArray(payload.products)) {
    throw new Error("The product API returned an invalid response.");
  }

  const mappedProducts = payload.products
    .filter((item) => item.is_active)
    .map((item) => {
      const localProduct = matchLocalProduct(item);

      if (!localProduct) {
        console.warn(`No local image/design metadata found for product: ${item.name}`);
        return null;
      }

      return {
        ...localProduct,
        backendId: item.id,
        name: item.name,
        price: Number(item.price),
        description: item.description || localProduct.description,
        stockQuantity: item.stock_quantity,
        currencyCode: item.currency || "INR",
        imageUrl: item.image_url || null,
      };
    })
    .filter((product) => product !== null);

  const query = (filters.search || "").trim().toLowerCase();

  const filtered = mappedProducts.filter(
    (product) =>
      (!query ||
        `${product.name} ${product.subtitle} ${product.category}`.toLowerCase().includes(query)) &&
      (!filters.category ||
        filters.category === "All gifts" ||
        product.category === filters.category) &&
      (!filters.occasion || product.occasions.includes(filters.occasion)),
  );

  if (filters.sort === "price-asc") {
    filtered.sort((a, b) => a.price - b.price);
  }

  if (filters.sort === "price-desc") {
    filtered.sort((a, b) => b.price - a.price);
  }

  return filtered;
}

export const storefrontApi = {
  source: "express" as const,

  // Use these async functions in customer-facing pages.
  listProducts: fetchProductsFromApi,

  getProduct: async (id: string): Promise<StorefrontProduct | undefined> => {
    const products = await fetchProductsFromApi();
    return products.find((product) => product.backendId === id || product.id === id);
  },

  // Local-only functions retained for compatibility with existing components.
  listLocalProducts: filterProducts,
  getLocalProduct: getProduct,

  capabilities: {
    authentication: false,
    payments: false,
    orders: false,
    uploads: false,
    ai: false,
  },
};

export function pageHead(title: string, description: string) {
  const fullTitle = `${title} | Bhasi Gift Studio`;

  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
