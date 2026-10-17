import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categories } from "@/data/catalogue";
import { storefrontApi, pageHead } from "@/lib/api/storefront";
import { ProductCard } from "@/features/storefront/product-card";
type SearchParams = {
  search?: string | undefined;
  category?: string | undefined;
  occasion?: string | undefined;
  sort?: string | undefined;
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
      "Shop our demo collection of photo mugs, sippers, pillows, T-shirts and portrait cards. Find a meaningful gift and make it yours.",
    ),
  component: Catalogue,
});
function Catalogue() {
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: "/products/" });
  const items = storefrontApi.listProducts(filters);
  const change = (patch: SearchParams) =>
    navigate({ search: (current) => ({ ...current, ...patch }), replace: true });
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
              onChange={(e) => change({ search: e.target.value })}
            />
          </div>
          <select
            className="select-field"
            aria-label="Sort products"
            value={filters["sort"] || "featured"}
            onChange={(e) => change({ sort: e.target.value })}
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
              onClick={() => change({ category })}
            >
              {category}
            </Button>
          ))}
        </div>
        <div className="mb-7 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{items.length} thoughtful gifts · Demo catalogue</span>
          {filters["occasion"] && (
            <Button variant="link" size="sm" onClick={() => change({ occasion: undefined })}>
              Clear occasion ×
            </Button>
          )}
        </div>
        {items.length ? (
          <div className="product-grid">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={35} />
            <h2>No little things found. Yet.</h2>
            <p>Try another search or take a peek at the whole collection.</p>
            <Button onClick={() => navigate({ search: {} })}>Show all gifts</Button>
          </div>
        )}
      </section>
    </>
  );
}
