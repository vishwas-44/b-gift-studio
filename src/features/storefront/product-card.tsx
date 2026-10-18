import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currency, type Product } from "@/data/catalogue";
import { useStore } from "./store-context";
export function ProductCard({ product }: { product: Product }) {
  const { add } = useStore();
  return (
    <article className="product-card group min-w-0">
      <Link
        to="/products/$productId"
        params={{ productId: product.id }}
        className="product-image-link"
        aria-label={`View ${product.name}`}
      >
        <img
          src={product.image}
          alt={`Personalized ${product.name} illustrative design`}
          width={512}
          height={512}
          loading="lazy"
          className="product-image"
        />
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <span className="product-image-action">
          <ArrowUpRight size={18} />
        </span>
      </Link>
      <div className="pt-4">
        <span className="eyebrow text-muted-foreground">{product.category}</span>
        <Link to="/products/$productId" params={{ productId: product.id }} className="block">
          <h3 className="mt-1 text-base font-semibold">{product.name}</h3>
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">{product.subtitle}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-semibold">
            {currency(product.price)}{" "}
            {product.id === "portrait-cards" && (
              <span className="text-xs font-normal text-muted-foreground">/ 20 photos</span>
            )}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Add ${product.name} to cart`}
            title="Add to bag"
            onClick={() => add(product.id, product.variants[0])}
          >
            <Plus size={17} />
          </Button>
        </div>
      </div>
    </article>
  );
}
