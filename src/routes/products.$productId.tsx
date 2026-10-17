import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRight, Minus, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currency, getProduct, type Product } from "@/data/catalogue";
import { pageHead } from "@/lib/api/storefront";
import { useStore } from "@/features/storefront/store-context";
export const Route = createFileRoute("/products/$productId")({
  loader: ({ params }) => {
    const product = getProduct(params.productId);
    if (!product) throw notFound();
    return product;
  },
  head: ({ loaderData }) =>
    pageHead(
      loaderData?.name || "Gift unavailable",
      loaderData?.description || "Explore personalized gifts at Bhasi Gift Studio.",
    ),
  component: ProductRoute,
});
function ProductRoute() {
  const product = Route.useLoaderData();
  return <ProductDetail key={product.id} product={product} />;
}
function ProductDetail({ product }: { product: Product }) {
  const [variant, setVariant] = useState(product.variants[0]);
  const [quantity, setQuantity] = useState(1);
  const { add } = useStore();
  return (
    <div className="container">
      <div className="breadcrumb mt-7">
        <Link to="/">Home</Link>
        <ChevronRight size={12} />
        <Link to="/products" search={{}}>
          Gifts
        </Link>
        <ChevronRight size={12} />
        <span>{product.name}</span>
      </div>
      <div className="product-detail">
        <div>
          <img
            src={product.image}
            alt={`Illustrative personalized ${product.name}`}
            width={512}
            height={512}
            className="detail-image"
          />
          <p className="preview-caption">
            Illustrative product visual · Your design will be unique to you.
          </p>
        </div>
        <div className="detail-content">
          <span className="eyebrow text-primary">{product.category} · Made personal</span>
          <h1>{product.name}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{product.subtitle}</p>
          <p className="detail-price">
            {currency(product.price)}
            {product.id === "portrait-cards" && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">for 20 photos</span>
            )}
          </p>
          <p className="detail-description">{product.description}</p>
          <div className="mt-7">
            <span className="text-xs font-semibold">
              {product.id === "t-shirt" ? "Choose size" : "Style"}
            </span>
            <div className="variant-options">
              {product.variants.map((v) => (
                <Button
                  key={v}
                  variant={v === variant ? "default" : "outline"}
                  onClick={() => setVariant(v)}
                  aria-pressed={v === variant}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold">Quantity</p>
            <div className="quantity">
              <Button
                variant="ghost"
                size="icon"
                disabled={quantity === 1}
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => q - 1)}
              >
                <Minus />
              </Button>
              <span>{quantity}</span>
              <Button
                variant="ghost"
                size="icon"
                disabled={quantity === 99}
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus />
              </Button>
            </div>
          </div>
          <div className="detail-actions">
            <Button asChild size="lg">
              <Link to="/customize" search={{ product: product.id, variant }}>
                <Sparkles />
                Make it personal
              </Link>
            </Button>
            <Button variant="outline" size="lg" onClick={() => add(product.id, variant, quantity)}>
              <ShoppingBag />
              Add to demo bag · {currency(product.price * quantity)}
            </Button>
          </div>
          <div className="demo-notice mt-6">
            <strong>A little heads-up</strong>
            <br />
            This is a frontend demo. Shipping and tax are not included. Personalization previews are
            illustrative; printing and fulfilment are not connected.
          </div>
        </div>
      </div>
    </div>
  );
}
