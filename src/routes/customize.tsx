import { createFileRoute, Link } from "@tanstack/react-router";
import { getProduct, products } from "@/data/catalogue";
import { Customizer } from "@/features/storefront/customizer";
import { pageHead } from "@/lib/api/storefront";
import { useStore } from "@/features/storefront/store-context";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/customize")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    product?: string | undefined;
    variant?: string | undefined;
    designId?: string | undefined;
  } => ({
    product: typeof s["product"] === "string" ? s["product"] : undefined,
    variant: typeof s["variant"] === "string" ? s["variant"] : undefined,
    designId: typeof s["designId"] === "string" ? s["designId"] : undefined,
  }),
  head: () =>
    pageHead(
      "Make it personal",
      "Create and save a personalized gift design with editable text, AI generated artwork, and AI photo transformations.",
    ),
  component: Customize,
});
function Customize() {
  const { product, variant, designId } = Route.useSearch();
  const { designs, designsReady, designError, refreshDesigns } = useStore();
  const design = designId ? designs.find((d) => d.id === designId) : undefined;
  const selected = getProduct(design?.productId || product || "") || products[0];
  if (!selected) return null;
  return (
    <>
      <section className="page-heading">
        <div className="container">
          <span className="eyebrow text-primary">The personal touch</span>
          <h1>Make it a little more them.</h1>
          <p>Your photo. Your words. Saved only in this browser.</p>
          <Button asChild variant="link" className="mt-2 px-0">
            <Link to="/designs">Your saved designs</Link>
          </Button>
        </div>
      </section>
      {designId && !designsReady ? (
        <p role="status" className="container py-12">
          Opening your local design…
        </p>
      ) : designId && !design ? (
        <div className="container py-12">
          <div className="status-notice" role="alert">
            <h2>Saved draft unavailable</h2>
            <p>
              {designError ||
                "This design is missing from this browser. It may have been deleted, or saved on another device. No artwork can be restored from the bag reference."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {designError && (
                <Button variant="outline" onClick={() => void refreshDesigns()}>
                  Retry browser storage
                </Button>
              )}
              <Button asChild>
                <Link to="/customize" search={{ product: selected.id, variant }}>
                  Start a new design
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/designs">Saved designs</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Customizer
          key={designId || `${selected.id}:${variant || ""}`}
          initialProduct={selected}
          initialVariant={design?.variant || variant}
          initialDesign={design}
        />
      )}
    </>
  );
}
