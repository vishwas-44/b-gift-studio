import { Link } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currency, getProduct } from "@/data/catalogue";
import { useStore } from "./store-context";
export function CartContent({ close }: { close?: () => void }) {
  const { cart, update, remove, total, ready, designsReady, designError, refreshDesigns } =
    useStore();
  if (!ready)
    return (
      <p className="py-12 text-muted-foreground" role="status">
        Opening your bag…
      </p>
    );
  if (!cart.length)
    return (
      <div className="empty-state">
        <ShoppingBag size={42} strokeWidth={1} />
        <h2>Your next lovely thing is waiting.</h2>
        <p>Your demo bag is empty. Let’s make it personal.</p>
        <Button asChild onClick={close}>
          <Link to="/products" search={{}}>
            Explore gifts <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  return (
    <>
      <div className="cart-items">
        {cart.map((item) => {
          const product = getProduct(item.productId);
          if (!product) return null;
          return (
            <div className="cart-row" key={item.key}>
              <Link to="/products/$productId" params={{ productId: product.id }} onClick={close}>
                <img src={product.image} alt={product.name} width={92} height={92} />
              </Link>
              <div className="min-w-0">
                <Link
                  to="/products/$productId"
                  params={{ productId: product.id }}
                  onClick={close}
                  className="font-semibold text-sm"
                >
                  {product.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">{item.variant}</p>
                {item.designId && (
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="text-primary">Personalized · saved in this browser</p>
                    {!designsReady ? (
                      <p role="status">Opening saved draft…</p>
                    ) : item.design ? (
                      <>
                        <p className="text-muted-foreground break-words">
                          {item.design.artwork ? "Photo attached · " : ""}
                          {item.design.texts.length} editable text{" "}
                          {item.design.texts.length === 1 ? "layer" : "layers"}
                        </p>
                        {item.design.texts.map((t) => (
                          <p key={t.id} className="text-muted-foreground break-words">
                            {t.text}
                          </p>
                        ))}
                        {item.design.artwork && (
                          <img
                            src={item.design.artwork}
                            alt="Saved local artwork"
                            className="cart-artwork"
                          />
                        )}
                        <Button asChild variant="link" size="sm" className="px-0 h-auto">
                          <Link
                            to="/customize"
                            search={{ designId: item.designId }}
                            onClick={close}
                          >
                            Edit design
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground">
                          {designError
                            ? "Saved draft could not be opened. Retry browser storage."
                            : "Saved draft missing. This bag item has no attached artwork or text."}
                        </p>
                        {designError && (
                          <Button size="sm" variant="outline" onClick={() => void refreshDesigns()}>
                            Retry browser storage
                          </Button>
                        )}
                        <Button asChild variant="link" size="sm" className="px-0 h-auto">
                          <Link
                            to="/customize"
                            search={{ product: item.productId, variant: item.variant }}
                            onClick={close}
                          >
                            Create replacement design
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <div className="quantity">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={item.quantity <= 1}
                      aria-label={`Decrease ${product.name} quantity`}
                      onClick={() => update(item.key, item.quantity - 1)}
                    >
                      <Minus />
                    </Button>
                    <span>{item.quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={item.quantity >= 99}
                      aria-label={`Increase ${product.name} quantity`}
                      onClick={() => update(item.key, item.quantity + 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove item"
                    aria-label={`Remove ${product.name}`}
                    onClick={() => remove(item.key)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
              <span className="text-sm font-semibold">
                {currency(product.price * item.quantity)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="cart-summary">
        <div className="flex justify-between text-lg font-semibold">
          <span>Demo subtotal</span>
          <span>{currency(total)}</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Shipping and tax are not included in the demo subtotal. Final calculation is pending
          backend configuration.
        </p>
        <Button asChild size="lg" className="mt-5 w-full" onClick={close}>
          <Link to="/checkout">
            Continue to demo checkout <ArrowRight />
          </Link>
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          No payment will be collected.
        </p>
      </div>
    </>
  );
}
