import { authFetch } from "./auth";

async function requestImage(path: string, body: BodyInit): Promise<string> {
  const response = await authFetch(`/api/ai/${path}`, {
    method: "POST",
    body,
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    image?: { mimeType?: string; data?: string };
  } | null;
  if (
    !response.ok ||
    !payload?.success ||
    !payload.image?.data ||
    payload.image.mimeType !== "image/png"
  ) {
    throw new Error(payload?.message || `Image request failed (HTTP ${response.status}).`);
  }
  return `data:image/png;base64,${payload.image.data}`;
}

export function generateDesign(input: {
  prompt: string;
  style: string;
  productName: string;
}): Promise<string> {
  return requestImage("design", JSON.stringify(input));
}

export function transformPhoto(input: {
  file: File;
  prompt: string;
  style: string;
}): Promise<string> {
  const form = new FormData();
  form.set("file", input.file);
  form.set("prompt", input.prompt);
  form.set("style", input.style);
  return requestImage("transform", form);
}
