import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FolderHeart, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getProduct } from "@/data/catalogue";
import { useStore } from "@/features/storefront/store-context";
import { DesignPreview } from "@/features/storefront/design-preview";
import { pageHead } from "@/lib/api/storefront";
export const Route = createFileRoute("/designs")({
  head: () =>
    pageHead(
      "Saved designs",
      "Save, edit and reuse personalized gift drafts stored only in this browser. No uploads, orders or print-ready files.",
    ),
  component: Designs,
});
function Designs() {
  const { designs, designsReady, designError, refreshDesigns, deleteDesign } = useStore();
  const [deleting, setDeleting] = useState<string>();
  const [confirm, setConfirm] = useState<string>();
  async function remove(id: string) {
    setDeleting(id);
    try {
      await deleteDesign(id);
      setConfirm(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete. Please retry.");
    } finally {
      setDeleting(undefined);
    }
  }
  return (
    <>
      <section className="page-heading">
        <div className="container">
          <span className="eyebrow text-primary">Your local collection</span>
          <h1>Saved designs.</h1>
          <p>
            Stored only in this browser. Not uploaded, backed up or print-ready. Clearing browser
            data removes your designs.
          </p>
        </div>
      </section>
      <section className="container section">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <p className="text-sm text-muted-foreground">
            {designs.length} saved {designs.length === 1 ? "design" : "designs"}
          </p>
          <Button asChild>
            <Link to="/customize" search={{}}>
              Create a design
              <ArrowRight />
            </Link>
          </Button>
        </div>
        {designError && (
          <div role="alert" className="demo-notice mb-6">
            <p>{designError}</p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={!designsReady}
              onClick={() => void refreshDesigns()}
            >
              <RefreshCw />
              Retry browser storage
            </Button>
          </div>
        )}
        {!designsReady ? (
          <p role="status">Opening your local designs…</p>
        ) : !designs.length ? (
          <div className="empty-state">
            <FolderHeart size={42} />
            <h2>A little idea worth keeping.</h2>
            <p>No saved designs in this browser yet.</p>
          </div>
        ) : (
          <div className="saved-design-grid">
            {designs.map((design) => (
              <article className="saved-design-card" key={design.id}>
                <DesignPreview design={design} />
                <div className="p-4 min-w-0">
                  <h2 className="font-semibold break-words">{design.name}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {getProduct(design.productId)?.name} · {design.variant}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {design.artwork ? "1 photo · " : ""}
                    {design.texts.length} text {design.texts.length === 1 ? "layer" : "layers"} ·
                    Local to this browser
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Updated {new Date(design.updatedAt).toLocaleDateString()}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/customize" search={{ designId: design.id }}>
                        <Pencil />
                        Edit / reuse
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${design.name}`}
                      title="Delete saved design"
                      onClick={() => setConfirm(design.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {confirm === design.id && (
                    <div className="mt-3 text-xs space-y-3">
                      <p>
                        Delete from this browser? Any bag item using it will show a missing draft.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={Boolean(deleting)}
                          onClick={() => void remove(design.id)}
                        >
                          {deleting === design.id ? "Deleting…" : "Delete design"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(deleting)}
                          onClick={() => setConfirm(undefined)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
