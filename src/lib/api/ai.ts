const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function getAccessToken(): string {
  const raw = localStorage.getItem("bhasi-auth-session");
  if (!raw) throw new Error("Sign in to use AI design tools.");
  try {
    const session = JSON.parse(raw) as { access_token?: unknown };
    if (typeof session.access_token === "string" && session.access_token)
      return session.access_token;
  } catch {
    // Return the same safe session error for malformed local session data.
  }
  throw new Error("Your sign-in session expired. Please sign in again.");
}

async function requestImage(path: string, body: BodyInit): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/ai/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAccessToken()}` },
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
