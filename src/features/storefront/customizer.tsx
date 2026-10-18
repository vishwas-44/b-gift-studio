import { useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { currency, products, type Product } from "@/data/catalogue";
import { useStore } from "./store-context";
import type { TextLayer } from "./cart-model";
import type { SavedDesign } from "./design-storage";
import { hasDesignSession } from "@/lib/api/designs";
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
  const [showEditingHelp, setShowEditingHelp] = useState(initialProduct.id !== "portrait-cards");
  const [artwork, setArtwork] = useState<string | undefined>(
    initialDesign?.artwork ?? initialDesign?.artworks?.[0],
  );
  const [assetId, setAssetId] = useState<string | undefined>(initialDesign?.assetId);
  const [assetIds, setAssetIds] = useState<string[] | undefined>(initialDesign?.assetIds);
  const [savedPhotoCount, setSavedPhotoCount] = useState(
    initialDesign?.assetIds?.length ?? initialDesign?.artworks?.length ?? 0,
  );
  const [portraitPhotos, setPortraitPhotos] = useState<File[]>([]);
  const [texts, setTexts] = useState<TextLayer[]>(
    initialDesign?.texts.map((t) => ({ ...t })) || [],
  );
  const [selected, setSelected] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [aiText, setAiText] = useState("");
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
    if (
      product.id === "portrait-cards" &&
      portraitPhotos.length > 0 &&
      portraitPhotos.length !== 20
    ) {
      toast.info("Select all 20 photos before saving this set.");
      return;
    }
    if (product.id === "portrait-cards" && portraitPhotos.length === 0 && savedPhotoCount !== 20) {
      toast.info("Choose 20 photos before saving this set.");
      return;
    }
    if (
      !artwork &&
      !portraitPhotos.length &&
      !assetIds?.length &&
      !texts.some((t) => t.text.trim())
    ) {
      toast.info("Add a photo or a few words before saving.");
      return;
    }
    if (savedId && !copy && !designs.some((d) => d.id === savedId)) {
      toast.error("This saved design was deleted. Save a copy to keep this draft.");
      return;
    }
    setSaving(true);
    try {
      const artworks =
        portraitPhotos.length === 20
          ? await Promise.all(
              portraitPhotos.map(
                (file) =>
                  new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () =>
                      typeof reader.result === "string"
                        ? resolve(reader.result)
                        : reject(new Error("Unable to read one of the selected photos."));
                    reader.onerror = () =>
                      reject(new Error("Unable to read one of the selected photos."));
                    reader.readAsDataURL(file);
                  }),
              ),
            )
          : undefined;
      const saved = await saveDesign({
        name: name.trim() || `${product.name} design`,
        productId: product.id,
        variant,
        ...(!copy && savedId ? { id: savedId } : {}),
        ...(artwork ? { artwork } : {}),
        ...(assetId ? { assetId } : {}),
        ...(assetIds?.length && !artworks ? { assetIds } : {}),
        ...(artworks ? { artworks } : {}),
        texts: texts.map((t) => ({ ...t })),
      });
      setSavedId(saved.id);
      setName(saved.name);
      setAssetIds(saved.assetIds);
      setSavedPhotoCount(saved.assetIds?.length ?? saved.artworks?.length ?? 0);
      setPortraitPhotos([]);
      setArtwork(saved.artwork ?? saved.artworks?.[0]);
      toast.success(
        hasDesignSession() ? "Design saved to your account." : "Design saved to this browser.",
      );
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
        setAssetId(undefined);
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
  function openExternalAi(provider: "chatgpt" | "gemini") {
    const printShape =
      product.id === "portrait-cards"
        ? "portrait 2:3 aspect ratio, one card image"
        : ["white-mug", "magic-mug", "sipper"].includes(product.id)
          ? "wide landscape 3:1 aspect ratio for a wraparound print"
          : "square 1:1 aspect ratio for the print area";
    const details =
      mode === "ai-photo"
        ? [
            `I want to create a personalized ${product.name} (${variant}) gift using a photo of my friend as the main subject, not as a generic reference image.`,
            "If I have not attached the photo yet, ask me to upload the photo of my friend first. Use that person as the subject and preserve their recognizable appearance; do not replace them with a different person.",
            "Before generating anything, have a short conversation with me. Ask about the occasion and why I am making this gift, how I want my friend represented (for example, faithful portrait, elegant line art, cartoon, or themed illustration), the mood or colors I prefer, and any visual details to add. Ask one or two clear questions at a time, wait for my answers, and do not generate until I have answered.",
            prompt.trim()
              ? `Artwork description: ${prompt.trim()}. Use this as visual direction, then ask any brief follow-up questions needed.`
              : "Ask me to describe the artwork I want as part of that conversation.",
            aiText.trim()
              ? `Personal gift message for the recipient, to include in the artwork exactly as written: “${aiText.trim()}”. Confirm its spelling and placement with me.`
              : "Ask whether I want a personal gift message, name, or date included in the artwork, and confirm the exact spelling before creating the image.",
            `After we agree on the design, create print-friendly artwork in ${printShape} for this product. Keep the person's face and all wording clear and inside the safe area. Do not include a product mockup, extra border, or unrelated reference imagery. Ask what art style I prefer if I have not described one.`,
            "Return the high-resolution image and explain how I can download it to upload into my gift editor.",
          ].join(" ")
        : [
            `Create print-friendly artwork for a ${product.name} (${variant}), based on my artwork description and any photo I upload. Ask me to upload a photo if needed.`,
            `Compose it in ${printShape}; keep the main subject and text inside the safe area, with no product mockup or extra border.`,
            prompt.trim()
              ? `Artwork description: ${prompt.trim()}.`
              : "Ask me to describe the artwork I want.",
            aiText.trim()
              ? `Include this personal gift message for the recipient exactly as written: “${aiText.trim()}”.`
              : "Ask whether I want a personal gift message, name, or date included in the artwork.",
            "If I have not described an art style, recommend one that fits the artwork description.",
            "Return a high-resolution image and tell me how to download it so I can upload it to my gift editor.",
          ].join(" ");
    const url =
      provider === "chatgpt"
        ? `https://chatgpt.com/?q=${encodeURIComponent(details)}`
        : `https://gemini.google.com/app?prompt=${encodeURIComponent(details)}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
      <Dialog open={showEditingHelp} onOpenChange={setShowEditingHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Need a hand with your personalization?</DialogTitle>
            <DialogDescription>
              We&apos;re sorry: the normal editor can currently have glitches. For a more guided
              result, try AI Design for a new illustration or AI Photo Transform to turn a
              friend&apos;s photo into gift artwork.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-6">
            <p>
              You can still save your design and place your order. If you need any changes after
              ordering, message us on WhatsApp at <strong>9035127328</strong> with your order number
              and the changes you want.
            </p>
          </div>
          <DialogFooter className="flex-wrap gap-2 sm:justify-start">
            <Button
              onClick={() => {
                setMode("ai-design");
                setShowEditingHelp(false);
              }}
            >
              <Sparkles /> Try AI Design
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMode("ai-photo");
                setShowEditingHelp(false);
              }}
            >
              <WandSparkles /> Try AI Photo Transform
            </Button>
            <Button variant="ghost" onClick={() => setShowEditingHelp(false)}>
              Continue with normal editor
            </Button>
          </DialogFooter>
          <a
            className="text-sm font-medium text-primary underline underline-offset-4"
            href="https://wa.me/919035127328?text=Hi%2C%20I%20need%20help%20with%20a%20personalized%20gift.%20My%20order%20number%20is%3A%20"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contact us on WhatsApp
          </a>
        </DialogContent>
      </Dialog>
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
              {product.id === "portrait-cards" ? (
                <div className="space-y-3">
                  <div>
                    <h2 className="mb-1">Choose your 20 photos</h2>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Select 20 JPG, PNG, or WebP images. Each original photo stays separate at its
                      uploaded resolution for printing. Selection order sets photo numbers.
                    </p>
                  </div>
                  <label className="upload-area">
                    <Upload size={24} />
                    <strong>Select photos ({portraitPhotos.length}/20)</strong>
                    <span>Each image must be 8 MB or smaller.</span>
                    <input
                      type="file"
                      className="sr-only"
                      aria-label="Select 20 portrait card photos"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={reading || saving || portraitPhotos.length >= 20}
                      onChange={(event) => {
                        const selectedFiles = Array.from(event.target.files || []);
                        const allowed = selectedFiles.filter(
                          (file) =>
                            ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
                            file.size <= 8 * 1024 * 1024,
                        );
                        if (allowed.length !== selectedFiles.length) {
                          toast.error("Use JPG, PNG, or WebP photos up to 8 MB each.");
                        }
                        const remaining = 20 - portraitPhotos.length;
                        if (allowed.length > remaining) {
                          toast.error("You can add " + remaining + " more photo(s) to this set.");
                        }
                        if (allowed.length > 0 && portraitPhotos.length === 0) {
                          setAssetIds(undefined);
                          setAssetId(undefined);
                          setSavedPhotoCount(0);
                          setArtwork(undefined);
                        }
                        setPortraitPhotos((current) => [
                          ...current,
                          ...allowed.slice(0, remaining),
                        ]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {portraitPhotos.length > 0 && (
                    <div className="max-h-28 overflow-auto rounded-lg border bg-white p-3 text-xs text-muted-foreground">
                      {portraitPhotos.map((photo, index) => (
                        <p key={photo.name + "-" + index} className="truncate">
                          {index + 1}. {photo.name}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {portraitPhotos.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving}
                        onClick={() => {
                          setPortraitPhotos([]);
                          setAssetIds(undefined);
                          setAssetId(undefined);
                          setSavedPhotoCount(0);
                        }}
                      >
                        Clear selected photos
                      </Button>
                    )}
                  </div>
                  {savedPhotoCount > 0 && portraitPhotos.length === 0 && (
                    <p className="text-xs text-emerald-700">
                      {savedPhotoCount} separate photo(s) are saved. Select 20 new photos to replace
                      this set.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <h2 className="mb-3">A photo worth keeping</h2>
                  <label className="upload-area">
                    <Upload size={24} />
                    <strong>
                      {reading
                        ? "Opening your photo?"
                        : artwork
                          ? "Replace your photo"
                          : "Add your favourite photo"}
                    </strong>
                    <span>JPG, PNG or WebP ? up to 8 MB</span>
                    <input
                      type="file"
                      className="sr-only"
                      aria-label="Upload a photo"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={reading}
                      onChange={(event) => {
                        void upload(event.target.files?.[0]);
                        event.target.value = "";
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
                        setAssetId(undefined);
                        toast("Photo removed");
                      }}
                    >
                      Remove photo
                    </Button>
                  )}
                </div>
              )}
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
                Save design & add personalized item · {currency(product.price)}
              </Button>
              <p className="text-xs leading-6 text-muted-foreground">
                Signed-in designs sync to your account. Guest designs stay in this browser. Saved
                text remains editable; previews are illustrative and are not print-ready.
              </p>
            </>
          ) : (
            <div className="ai-panel">
              <span className="pending-label">
                <Sparkles size={13} />
                AI tools
              </span>
              <h2>
                {mode === "ai-design" ? "A spark of an idea." : "See your memory differently."}
              </h2>
              <p>
                {mode === "ai-design"
                  ? "Describe the artwork and recipient message. We’ll add the selected product’s print size when you open ChatGPT or Gemini."
                  : "Describe how you want the uploaded photo transformed and add an optional message for the recipient. ChatGPT or Gemini will guide you through adding the photo."}
              </p>
              <label className="field">
                Describe the artwork
                <textarea
                  rows={4}
                  value={prompt}
                  maxLength={1000}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A little garden of wildflowers, with a tiny heart hidden among them…"
                />
              </label>
              <label className="field">
                Gift note or personal message for the recipient (optional)
                <textarea
                  rows={2}
                  value={aiText}
                  maxLength={150}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="A short message, name, or date to include on the gift"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => openExternalAi("chatgpt")}>
                  <WandSparkles /> Open ChatGPT
                </Button>
                <Button variant="outline" onClick={() => openExternalAi("gemini")}>
                  <Sparkles /> Open Gemini
                </Button>
              </div>
              <label className="upload-area">
                <Upload size={22} />
                <strong>
                  {artwork
                    ? "Replace with downloaded AI image"
                    : "Upload your downloaded AI image here"}
                </strong>
                <span>
                  Choose the image you saved from ChatGPT or Gemini (JPG, PNG or WebP · up to 8 MB)
                </span>
                <input
                  type="file"
                  className="sr-only"
                  aria-label="Upload downloaded AI image"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={reading}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                    setMode("normal");
                  }}
                />
              </label>
              <p className="text-xs leading-6 text-muted-foreground">
                The prompt gives an approximate print shape for this product (mugs and sippers: wide
                wrap; shirts and pillows: square; portrait cards: portrait). Upload your reference
                photo in ChatGPT or Gemini. The AI service is separate from this store.
              </p>
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
          <div className="preview-toolbar">
            {mode !== "normal" && artwork && (
              <Button size="sm" variant="outline" onClick={() => setMode("normal")}>
                Edit result
              </Button>
            )}
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
          </div>
          <p className="preview-caption">
            {mode === "normal"
              ? "Flat product preview for positioning your photo and editable text. This preview is illustrative and is not a print proof."
              : artwork
                ? "AI result is shown on the product preview. Use Edit result to adjust text, save the design, or add it to your bag."
                : mode === "ai-photo"
                  ? "Choose a photo, describe the transformation, and generate an image. Your original stays available for another try."
                  : "Describe your idea and generate original artwork. Review the result here before saving."}
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
