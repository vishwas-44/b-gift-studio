const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "AI usage limit reached. Please try again in a few minutes.",
  },
});
const styles = new Set(["Watercolour", "Line art", "Illustration", "Pop art", "Minimal"]);

function imageMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  return null;
}

function validatePrompt(prompt, style) {
  if (typeof prompt !== "string" || prompt.trim().length < 3 || prompt.length > 1000) {
    return "Describe your idea in 3 to 1000 characters.";
  }
  if (!styles.has(style)) return "Choose one of the available art styles.";
  return null;
}

async function openAiImage(path, body, headers = {}) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("AI tools need OPENAI_API_KEY configured in backend/.env.");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://api.openai.com/v1/images/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...headers },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      response.status === 429
        ? "The image service is busy. Please try again shortly."
        : "The image service could not complete this request. Check the server configuration and try again.",
    );
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const image = result?.data?.[0]?.b64_json;
  if (typeof image !== "string" || !image) {
    const error = new Error("The image service returned no image. Please try a different prompt.");
    error.status = 502;
    throw error;
  }
  return image;
}

router.use(requireAuth, aiLimiter);

router.post("/design", async (req, res, next) => {
  try {
    const { prompt, style, productName } = req.body || {};
    const invalid = validatePrompt(prompt, style);
    if (invalid) return res.status(400).json({ success: false, message: invalid });
    if (typeof productName !== "string" || productName.length > 100) {
      return res.status(400).json({ success: false, message: "Select a valid gift product." });
    }

    const request = new FormData();
    request.set("model", "gpt-image-1");
    request.set(
      "prompt",
      `Create original printable artwork for a ${productName} gift. Idea: ${prompt.trim()}. Art style: ${style}. Make one centered, polished design with a clean transparent background, safe margins, no product mockup, no lettering, no watermark, and no extra borders.`,
    );
    request.set("size", "1024x1024");
    request.set("quality", "medium");
    request.set("background", "transparent");
    request.set("output_format", "png");
    const image = await openAiImage("generations", request);
    return res.json({ success: true, image: { mimeType: "image/png", data: image } });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res
        .status(504)
        .json({ success: false, message: "Image generation timed out. Please try again." });
    }
    if (error.status)
      return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  }
});

router.post(
  "/transform",
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Photo must be 8 MB or smaller."
              : "Upload one photo at a time.",
        });
      }
      return next(error);
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file)
        return res.status(400).json({ success: false, message: "Choose a photo to transform." });
      const mime = imageMime(req.file.buffer);
      if (!mime)
        return res
          .status(400)
          .json({ success: false, message: "Upload a valid JPG, PNG, or WebP photo." });
      const { prompt, style } = req.body || {};
      const invalid = validatePrompt(prompt, style);
      if (invalid) return res.status(400).json({ success: false, message: invalid });

      const form = new FormData();
      form.set("model", "gpt-image-1");
      form.set(
        "prompt",
        `Transform the supplied photo into ${style} artwork. Direction: ${prompt.trim()}. Preserve the recognizable people and important details from the original photo. Create a tasteful, high-quality gift illustration. Do not add text, logos, watermarks, frames, or product mockups.`,
      );
      form.set("size", "1024x1024");
      form.set("quality", "medium");
      form.set("output_format", "png");
      form.set(
        "image",
        new Blob([req.file.buffer], { type: mime }),
        `source.${mime.split("/")[1]}`,
      );
      const image = await openAiImage("edits", form);
      return res.json({ success: true, image: { mimeType: "image/png", data: image } });
    } catch (error) {
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        return res
          .status(504)
          .json({ success: false, message: "Photo transformation timed out. Please try again." });
      }
      if (error.status)
        return res.status(error.status).json({ success: false, message: error.message });
      return next(error);
    }
  },
);

module.exports = router;
