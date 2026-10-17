import { filterProducts, getProduct, type CatalogueFilter } from "@/data/catalogue";
// Replace this adapter with Express requests. Components never need backend keys.
export const storefrontApi = {
  source: "local-demo" as const,
  listProducts: (filters: CatalogueFilter = {}) => filterProducts(filters),
  getProduct,
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
