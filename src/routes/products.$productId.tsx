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

  const { add, getStoreProduct, priceFor, stockFor, productsReady, productsError } = useStore();

  // Use backend product data for price and inventory.
  const storeProduct = getStoreProduct(product.id);
  const currentPrice = priceFor(product.id);
  const stockQuantity = stockFor(product.id);

  const hasProduct = Boolean(storeProduct);
  const hasConfirmedStock = typeof stockQuantity === "number" && stockQuantity > 0;

  const isUnavailable =
    !productsReady || Boolean(productsError) || !hasProduct || !hasConfirmedStock;

  const maximumQuantity = hasConfirmedStock ? Math.min(99, stockQuantity) : 1;

  const outOfStock = productsReady && !productsError && hasProduct && !hasConfirmedStock;

  function addToBag() {
    if (isUnavailable || quantity > maximumQuantity) return;
    add(product.id, variant, quantity);
  }

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

          <h1>{storeProduct?.name || product.name}</h1>

          <p className="mt-3 text-sm text-muted-foreground">{product.subtitle}</p>

          <p className="detail-price">
            {productsReady && !productsError && hasProduct
              ? currency(currentPrice)
              : "Loading price…"}

            {product.id === "portrait-cards" && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">for 20 photos</span>
            )}
          </p>

          <p className="detail-description">{storeProduct?.description || product.description}</p>

          {productsError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              We couldn't load the latest price and stock. Please try again shortly.
            </p>
          )}

          {productsReady && !productsError && !hasProduct && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              This product is currently unavailable.
            </p>
          )}

          {outOfStock && (
            <p role="status" className="mt-3 text-sm font-semibold text-destructive">
              Out of stock
            </p>
          )}

          {hasConfirmedStock && (
            <p className="mt-2 text-sm text-muted-foreground">{stockQuantity} available</p>
          )}

          <div className="mt-7">
            <span className="text-xs font-semibold">
              {product.id === "t-shirt" ? "Choose size" : "Style"}
            </span>

            {product.id === "portrait-cards" ? (
              <div className="mt-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                <strong>Set of 20 photos</strong>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload your 20 images in the personalization editor.
                </p>
              </div>
            ) : (
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
            )}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold">Quantity</p>

            <div className="quantity">
              <Button
                variant="ghost"
                size="icon"
                disabled={quantity === 1}
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus />
              </Button>

              <span>{quantity}</span>

              <Button
                variant="ghost"
                size="icon"
                disabled={quantity >= maximumQuantity}
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => Math.min(maximumQuantity, q + 1))}
              >
                <Plus />
              </Button>
            </div>
          </div>

          <div className="detail-actions">
            <Button asChild size="lg" disabled={isUnavailable}>
              <Link to="/customize" search={{ product: product.id, variant }}>
                <Sparkles />
                {product.id === "portrait-cards"
                  ? "Upload 20 photos & make it personal"
                  : "Make it personal"}
              </Link>
            </Button>

            {product.id !== "portrait-cards" && (
              <Button
                variant="outline"
                size="lg"
                disabled={isUnavailable || quantity > maximumQuantity}
                onClick={addToBag}
              >
                <ShoppingBag />
                {outOfStock
                  ? "Out of stock"
                  : !productsReady
                    ? "Loading…"
                    : `Add to bag · ${currency(currentPrice * quantity)}`}
              </Button>
            )}
          </div>

          <div className="status-notice mt-6">
            <strong>A little heads-up</strong>
            <br />
            Product images are illustrative. Shipping and tax are not included in the displayed
            price; the final amount is confirmed at checkout.
          </div>
        </div>
      </div>
    </div>
  );
}
