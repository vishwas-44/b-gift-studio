const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

type StoredSession = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
};

function readSession(): StoredSession {
  const raw = localStorage.getItem("bhasi-auth-session");

  if (!raw) {
    throw new Error("Please sign in before saving designs.");
  }

  let session: StoredSession;

  try {
    session = JSON.parse(raw);
  } catch {
    throw new Error("Your saved login session is invalid. Please sign in again.");
  }

  if (typeof session.access_token !== "string" || !session.access_token) {
    throw new Error("Your login session has expired. Please sign in again.");
  }

  return session;
}

async function refreshAccessToken(session: StoredSession): Promise<string> {
  if (typeof session.refresh_token !== "string" || !session.refresh_token) {
    localStorage.removeItem("bhasi-auth-session");
    throw new Error("Your sign-in session expired. Please sign in again.");
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success || !payload.session?.access_token) {
    localStorage.removeItem("bhasi-auth-session");
    throw new Error("Your sign-in session expired. Please sign in again.");
  }

  localStorage.setItem("bhasi-auth-session", JSON.stringify(payload.session));
  return payload.session.access_token as string;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const session = readSession();
  const expiresAt = typeof session.expires_at === "number" ? session.expires_at * 1000 : 0;
  if (forceRefresh || (expiresAt > 0 && expiresAt < Date.now() + 30_000)) {
    return refreshAccessToken(session);
  }
  return session.access_token as string;
}

export function hasDesignSession(): boolean {
  try {
    const raw = localStorage.getItem("bhasi-auth-session");
    if (!raw) return false;

    const session = JSON.parse(raw);

    return typeof session?.access_token === "string" && session.access_token.length > 0;
  } catch {
    return false;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const makeRequest = async (token: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  let response = await makeRequest(await getAccessToken());
  if (response.status === 401) response = await makeRequest(await getAccessToken(true));

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(
      typeof payload?.message === "string"
        ? payload.message
        : `Design request failed (HTTP ${response.status}).`,
    );
  }

  return payload as T;
}

export type DesignTextLayer = {
  id: string;
  text: string;
  color: string;
  size: number;
  x: number;
  y: number;
};

export type RemoteDesign = {
  id: string;
  product_id: string;
  design_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  design_data: {
    variant?: string;
    assetId?: string | null;
    assetIds?: string[];
    texts: DesignTextLayer[];
  };
  ai_prompt: string | null;
};

export type SaveRemoteDesignInput = {
  id?: string;
  productId: string;
  designName: string;
  variant: string;
  assetId?: string | null;
  assetIds?: string[];
  texts: DesignTextLayer[];
  aiPrompt?: string | null;
};

export async function listRemoteDesigns(): Promise<RemoteDesign[]> {
  const result = await request<{
    success: true;
    count: number;
    designs: RemoteDesign[];
  }>("/api/account/designs");

  return result.designs;
}

export async function saveRemoteDesign(input: SaveRemoteDesignInput): Promise<RemoteDesign> {
  const body = {
    productId: input.productId,
    designName: input.designName,
    variant: input.variant,
    assetId: input.assetId ?? null,
    assetIds: input.assetIds ?? [],
    designData: {
      texts: input.texts,
    },
    aiPrompt: input.aiPrompt ?? null,
  };

  if (input.id) {
    const result = await request<{
      success: true;
      design: RemoteDesign;
    }>(`/api/account/designs/${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return result.design;
  }

  const result = await request<{
    success: true;
    design: RemoteDesign;
  }>("/api/account/designs", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return result.design;
}

export async function uploadDesignAsset(
  file: File,
  options: {
    designId?: string;
    assetType?: "original_photo" | "generated_image" | "other";
    aiPrompt?: string;
    aiStyle?: string;
  } = {},
): Promise<{ id: string; storage_path: string }> {
  const makeRequest = async (token: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("assetType", options.assetType ?? "original_photo");
    if (options.designId) form.append("designId", options.designId);
    if (options.aiPrompt) form.append("aiPrompt", options.aiPrompt);
    if (options.aiStyle) form.append("aiStyle", options.aiStyle);
    return fetch(`${API_BASE_URL}/api/design-assets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  };
  let response = await makeRequest(await getAccessToken());
  if (response.status === 401) response = await makeRequest(await getAccessToken(true));

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success || !payload.asset?.id) {
    throw new Error(
      typeof payload?.message === "string"
        ? payload.message
        : `Image upload failed (HTTP ${response.status}).`,
    );
  }

  return payload.asset;
}

export async function getDesignAssetPreview(assetId: string): Promise<string> {
  const result = await request<{
    success: true;
    previewUrl: string;
    expiresInSeconds: number;
  }>(`/api/design-assets/${encodeURIComponent(assetId)}/preview`);

  return result.previewUrl;
}

export async function deleteRemoteDesign(id: string): Promise<void> {
  await request<{ success: true }>(`/api/account/designs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
