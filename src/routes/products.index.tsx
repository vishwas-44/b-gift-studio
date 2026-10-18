import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categories } from "@/data/catalogue";
import { fetchProductsFromApi, pageHead, type StorefrontProduct } from "@/lib/api/storefront";
import { ProductCard } from "@/features/storefront/product-card";

type SearchParams = {
  search: string | undefined;
  category: string | undefined;
  occasion: string | undefined;
  sort: string | undefined;
};

export const Route = createFileRoute("/products/")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    search: typeof s["search"] === "string" ? s["search"] : undefined,
    category: typeof s["category"] === "string" ? s["category"] : undefined,
    occasion: typeof s["occasion"] === "string" ? s["occasion"] : undefined,
    sort: typeof s["sort"] === "string" ? s["sort"] : undefined,
  }),

  head: () =>
    pageHead(
      "Explore personalized gifts",
      "Shop personalized mugs, sippers, pillows, T-shirts and portrait cards. Find a meaningful gift and make it yours.",
    ),

  component: Catalogue,
});

function Catalogue() {
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: "/products/" });

  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchProductsFromApi();

        if (!cancelled) {
          setProducts(result);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load products. Please try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const query = (filters["search"] || "").trim().toLowerCase();

  const items = products.filter((product) => {
    const matchesSearch =
      !query ||
      `${product.name} ${product.subtitle} ${product.category}`.toLowerCase().includes(query);

    const matchesCategory =
      !filters["category"] ||
      filters["category"] === "All gifts" ||
      product.category === filters["category"];

    const matchesOccasion = !filters["occasion"] || product.occasions.includes(filters["occasion"]);

    return matchesSearch && matchesCategory && matchesOccasion;
  });

  if (filters["sort"] === "price-asc") {
    items.sort((a, b) => a.price - b.price);
  } else if (filters["sort"] === "price-desc") {
    items.sort((a, b) => b.price - a.price);
  }

  const change = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (current) => ({
        ...current,
        ...patch,
      }),
      replace: true,
    });
  };

  return (
    <>
      <section className="page-heading">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link>
            <ChevronRight size={12} />
            <span>All gifts</span>
          </div>

          <h1>
            {filters["occasion"]
              ? `A little love for ${filters["occasion"].toLowerCase()}`
              : "Find their little something."}
          </h1>

          <p>Choose a gift. Add your memories. Make it unmistakably theirs.</p>
        </div>
      </section>

      <section className="section container">
        <div className="catalog-toolbar">
          <div className="search-field-wrap">
            <Search />

            <input
              className="search-field"
              aria-label="Search catalogue"
              placeholder="Search for a gift…"
              value={filters["search"] || ""}
              onChange={(event) => change({ search: event.target.value || undefined })}
            />
          </div>

          <select
            className="select-field"
            aria-label="Sort products"
            value={filters["sort"] || "featured"}
            onChange={(event) =>
              change({
                sort: event.target.value === "featured" ? undefined : event.target.value,
              })
            }
          >
            <option value="featured">Our favourites</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>

        <div className="category-tabs">
          {categories.map((category) => (
            <Button
              size="sm"
              key={category}
              variant={(filters["category"] || "All gifts") === category ? "default" : "outline"}
              onClick={() =>
                change({
                  category: category === "All gifts" ? undefined : category,
                })
              }
            >
              {category}
            </Button>
          ))}
        </div>

        <div className="mb-7 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {loading
              ? "Loading gifts…"
              : error
                ? "Catalogue unavailable"
                : `${items.length} thoughtful gifts · Live catalogue`}
          </span>

          {filters["occasion"] && (
            <Button variant="link" size="sm" onClick={() => change({ occasion: undefined })}>
              Clear occasion ×
            </Button>
          )}
        </div>

        {loading ? (
          <div className="empty-state" role="status">
            <p>Loading your gifts from Bhasi Gift Studio…</p>
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <h2>We couldn’t load the gifts.</h2>
            <p>{error}</p>
            <Button onClick={() => window.location.reload()}>Try again</Button>
          </div>
        ) : items.length > 0 ? (
          <div className="product-grid">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={35} />
            <h2>No little things found. Yet.</h2>
            <p>Try another search or take a peek at the whole collection.</p>
            <Button
              onClick={() => {
                void navigate({
                  search: {
                    search: undefined,
                    category: undefined,
                    occasion: undefined,
                    sort: undefined,
                  },
                });
              }}
            >
              Show all gifts
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
