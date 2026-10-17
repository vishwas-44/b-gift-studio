import { useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ImagePlus,
  Move,
  Plus,
  Save,
  ShoppingBag,
  Sparkles,
  Trash2,
  Type,
  Upload,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { currency, products, type Product } from "@/data/catalogue";
import { useStore } from "./store-context";
import type { TextLayer } from "./cart-model";
import type { SavedDesign } from "./design-storage";
type Mode = "normal" | "ai-design" | "ai-photo";
export function Customizer({
  initialProduct,
  initialVariant,
  initialDesign,
}: {
  initialProduct: Product;
  initialVariant?: string | undefined;
  initialDesign?: SavedDesign | undefined;
}) {
  const [productId, setProductId] = useState(initialProduct.id);
  const product = products.find((p) => p.id === productId) || initialProduct;
  const [variant, setVariant] = useState(
    initialVariant && initialProduct.variants.includes(initialVariant)
      ? initialVariant
      : initialProduct.variants[0],
  );
  const [mode, setMode] = useState<Mode>("normal");
  const [artwork, setArtwork] = useState<string | undefined>(initialDesign?.artwork);
  const [texts, setTexts] = useState<TextLayer[]>(
    initialDesign?.texts.map((t) => ({ ...t })) || [],
  );
  const [selected, setSelected] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Watercolour");
  const [reading, setReading] = useState(false);
  const [name, setName] = useState(initialDesign?.name || "");
  const [savedId, setSavedId] = useState(initialDesign?.id);
  const [saving, setSaving] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const selectedText = texts.find((t) => t.id === selected);
  const { add, saveDesign, designs } = useStore();
  const navigate = useNavigate();
  async function save(toBag = false, copy = false) {
    if (reading || saving) return;
    if (!artwork && !texts.some((t) => t.text.trim())) {
      toast.info("Add a photo or a few words before saving.");
      return;
    }
    if (savedId && !copy && !designs.some((d) => d.id === savedId)) {
      toast.error("This saved design was deleted. Save a copy to keep this draft.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveDesign({
        id: copy ? undefined : savedId,
        name: name.trim() || `${product.name} design`,
        productId: product.id,
        variant,
        artwork,
        texts: texts.map((t) => ({ ...t })),
      });
      setSavedId(saved.id);
      setName(saved.name);
      toast.success("Design saved only in this browser.");
      if (toBag) {
        add(saved.productId, saved.variant, 1, saved.id);
        await navigate({ to: "/cart" });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save. Keep this page open and retry.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG or WebP photo.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Please choose a photo under 8 MB.");
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setArtwork(reader.result);
        toast.success("Photo added to your local preview");
      }
      setReading(false);
    };
    reader.onerror = () => {
      setReading(false);
      toast.error("We couldn’t read that photo. Try another.");
    };
    reader.readAsDataURL(file);
  }
  function addText() {
    const layer: TextLayer = {
      id: crypto.randomUUID(),
      text: "Your lovely words",
      color: "#a92b48",
      size: 24,
      x: 50,
      y: 57,
    };
    setTexts((t) => [...t, layer]);
    setSelected(layer.id);
  }
  function editText(patch: Partial<TextLayer>) {
    setTexts((layers) =>
      layers.map((layer) => (layer.id === selected ? { ...layer, ...patch } : layer)),
    );
  }
  function pointerDown(e: PointerEvent<HTMLDivElement>, layer: TextLayer) {
    e.stopPropagation();
    setSelected(layer.id);
    const rect = preview.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = {
      id: layer.id,
      dx: e.clientX - (rect.left + (rect.width * layer.x) / 100),
      dy: e.clientY - (rect.top + (rect.height * layer.y) / 100),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const rect = preview.current?.getBoundingClientRect();
    if (!current || !rect) return;
    const x = Math.min(90, Math.max(10, ((e.clientX - rect.left - current.dx) / rect.width) * 100));
    const y = Math.min(90, Math.max(10, ((e.clientY - rect.top - current.dy) / rect.height) * 100));
    setTexts((t) => t.map((layer) => (layer.id === current.id ? { ...layer, x, y } : layer)));
  }
  return (
    <div className="container">
      <div className="editor-tabs" role="tablist" aria-label="Design mode">
        {[
          { id: "normal", label: "Normal Editor", icon: Type },
          { id: "ai-design", label: "AI Design", icon: Sparkles },
          { id: "ai-photo", label: "AI Photo Transform", icon: WandSparkles },
        ].map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={mode === id}
            aria-controls="editor-panel"
            variant={mode === id ? "default" : "ghost"}
            onClick={() => setMode(id as Mode)}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </div>
      <div
        className="editor-layout"
        id="editor-panel"
        role="tabpanel"
        aria-labelledby={`tab-${mode}`}
      >
        <div className="editor-controls">
          <label className="field">
            Your canvas
            <select
              value={productId}
              onChange={(e) => {
                const p = products.find((p) => p.id === e.target.value);
                if (p) {
                  setProductId(p.id);
                  setVariant(p.variants[0]);
                }
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {currency(p.price)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {product.id === "t-shirt" ? "Size" : "Style"}
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              {product.variants.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {mode === "normal" ? (
            <>
              <div>
                <h2 className="mb-3">A photo worth keeping</h2>
                <label className="upload-area">
                  <Upload size={24} />
                  <strong>
                    {reading
                      ? "Opening your photo…"
                      : artwork
                        ? "Replace your photo"
                        : "Add your favourite photo"}
                  </strong>
                  <span>JPG, PNG or WebP · up to 8 MB</span>
                  <input
                    type="file"
                    className="sr-only"
                    aria-label="Upload a photo"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={reading}
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {artwork && (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-1"
                    onClick={() => {
                      setArtwork(undefined);
                      toast("Photo removed");
                    }}
                  >
                    Remove photo
                  </Button>
                )}
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2>Your lovely words</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addText}
                    disabled={texts.length >= 10}
                  >
                    <Plus />
                    Add text
                  </Button>
                </div>
                {!texts.length && (
                  <p className="text-xs leading-6 text-muted-foreground">
                    A name, an inside joke, a little love.
                  </p>
                )}
                <div className="space-y-2">
                  {texts.map((layer) => (
                    <div className="editor-layer-row" key={layer.id}>
                      <Button
                        size="sm"
                        variant={selected === layer.id ? "secondary" : "ghost"}
                        onClick={() => setSelected(layer.id)}
                      >
                        <Type />
                        <span className="truncate">{layer.text || "Empty text"}</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove text ${layer.text}`}
                        onClick={() => {
                          setTexts((t) => t.filter((l) => l.id !== layer.id));
                          if (selected === layer.id) setSelected(undefined);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              {selectedText && (
                <>
                  <label className="field">
                    Edit text
                    <textarea
                      maxLength={150}
                      rows={2}
                      value={selectedText.text}
                      onChange={(e) => editText({ text: e.target.value })}
                    />
                  </label>
                  <div className="editor-color-row">
                    <label className="field">
                      Text colour
                      <input
                        type="color"
                        value={selectedText.color}
                        onChange={(e) => editText({ color: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      Size · {selectedText.size}px
                      <input
                        type="range"
                        min={12}
                        max={60}
                        value={selectedText.size}
                        onChange={(e) => editText({ size: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="editor-color-row">
                    <label className="field">
                      Horizontal position
                      <input
                        type="range"
                        min={10}
                        max={90}
                        value={selectedText.x}
                        onChange={(e) => editText({ x: Number(e.target.value) })}
                      />
                    </label>
                    <label className="field">
                      Vertical position
                      <input
                        type="range"
                        min={10}
                        max={90}
                        value={selectedText.y}
                        onChange={(e) => editText({ y: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </>
              )}
              <label className="field">
                Design name
                <input
                  maxLength={80}
                  value={name}
                  placeholder={`${product.name} design`}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={saving || reading} onClick={() => void save()}>
                  <Save />
                  {saving ? "Saving…" : "Save design"}
                </Button>
                {savedId && (
                  <Button
                    variant="ghost"
                    disabled={saving || reading}
                    onClick={() => void save(false, true)}
                  >
                    <Plus />
                    Save a copy
                  </Button>
                )}
              </div>
              <Button
                size="lg"
                className="whitespace-normal h-auto min-h-11"
                disabled={saving || reading}
                onClick={() => void save(true)}
              >
                <ShoppingBag />
                Save & add to demo bag · {currency(product.price)}
              </Button>
              <p className="text-xs leading-6 text-muted-foreground">
                Save keeps your photo and editable text only in this browser, including after
                refresh. Unsaved changes are lost on refresh. Nothing is uploaded or print-ready.
                Clearing browser data removes saved designs.
              </p>
            </>
          ) : (
            <div className="ai-panel">
              <span className="pending-label">
                <Sparkles size={13} />
                Integration pending
              </span>
              <h2>
                {mode === "ai-design" ? "A spark of an idea." : "See your memory differently."}
              </h2>
              <p>
                {mode === "ai-design"
                  ? "Imagine a design that feels like them. Your prompt is a local draft; generation is not connected."
                  : "Reimagine a photo in a new style. Photo transformation is not connected yet."}
              </p>
              {mode === "ai-photo" && (
                <label className="upload-area">
                  <ImagePlus />
                  <span>{artwork ? "Replace source photo" : "Choose a source photo"}</span>
                  <input
                    type="file"
                    className="sr-only"
                    aria-label="Upload AI source photo"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <label className="field">
                Your idea
                <textarea
                  rows={4}
                  value={prompt}
                  maxLength={1000}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A little garden of wildflowers, with a tiny heart hidden among them…"
                />
              </label>
              <label className="field">
                Style
                <select value={style} onChange={(e) => setStyle(e.target.value)}>
                  {["Watercolour", "Line art", "Illustration", "Pop art", "Minimal"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                onClick={() =>
                  toast.info(
                    "AI integration is pending. No images were generated or sent. Your idea stays in this session.",
                  )
                }
              >
                <WandSparkles />
                Generation coming soon
              </Button>
              <Button variant="outline" onClick={() => setMode("normal")}>
                Continue in Normal Editor
              </Button>
            </div>
          )}
        </div>
        <div className="editor-preview-wrap">
          <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="text-xs font-semibold">
              {mode === "normal" ? "Your product preview" : "Your creative canvas"}
            </span>
            <span className="text-xs text-muted-foreground">
              {mode === "normal" ? <Move size={15} /> : <Sparkles size={15} />}
            </span>
          </div>
          <div
            ref={preview}
            className="editor-preview"
            onPointerMove={pointerMove}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {mode === "normal" ? (
              <>
                <img
                  className="editor-base"
                  src={product.image}
                  alt={`${product.name} illustrative customization canvas`}
                  width={512}
                  height={512}
                />
                {artwork && (
                  <div className="artwork-print-area">
                    <img src={artwork} alt="Your uploaded artwork" />
                  </div>
                )}
                {texts.map((layer) => (
                  <div
                    key={layer.id}
                    className={`text-layer ${selected === layer.id ? "selected" : ""}`}
                    style={{
                      left: `${layer.x}%`,
                      top: `${layer.y}%`,
                      color: layer.color,
                      fontSize: `${layer.size}px`,
                    }}
                    onPointerDown={(e) => pointerDown(e, layer)}
                  >
                    {layer.text}
                  </div>
                ))}
              </>
            ) : (
              <div className="pending-preview">
                {mode === "ai-photo" && artwork ? (
                  <img
                    src={artwork}
                    alt="Original uploaded photo, not AI generated"
                    className="max-h-64 max-w-full object-contain"
                  />
                ) : (
                  <WandSparkles size={50} strokeWidth={1.2} />
                )}
                <h3>
                  {mode === "ai-photo" && artwork
                    ? "Your original photo"
                    : "Good ideas start here."}
                </h3>
                <p>
                  No generated result yet.
                  <br />
                  AI integration is pending.
                </p>
              </div>
            )}
          </div>
          <p className="preview-caption">
            {mode === "normal"
              ? "Illustrative mockup, not a print proof. The sample artwork is part of the product photo. Your photo and editable text remain separate."
              : "Prompt and style controls are local only. No AI request is sent."}
            {product.id === "portrait-cards" && (
              <>
                <br />
                One-photo preview only. 20-photo layout preparation is pending integration.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
