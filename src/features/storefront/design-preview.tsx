import { getProduct } from "@/data/catalogue";
import type { SavedDesign } from "./design-storage";
export function DesignPreview({ design }: { design: SavedDesign }) {
  const product = getProduct(design.productId);
  if (!product) return null;
  return (
    <div className="editor-preview saved-design-preview">
      <img
        className="editor-base"
        src={product.image}
        alt={`${product.name} illustrative local design preview`}
      />
      {(design.artwork || design.artworks?.length) && (
        <div className="artwork-print-area">
          <img src={design.artwork ?? design.artworks?.[0]} alt="Saved design photo" />
        </div>
      )}
      {design.texts.map((layer) => (
        <span
          className="text-layer"
          key={layer.id}
          style={{
            left: `${layer.x}%`,
            top: `${layer.y}%`,
            color: layer.color,
            fontSize: `${layer.size}px`,
          }}
        >
          {layer.text}
        </span>
      ))}
    </div>
  );
}
