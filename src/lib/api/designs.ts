import { authFetch, clearLegacyAuthSession, hasAuthSession } from "./auth";

export function hasDesignSession(): boolean {
  return hasAuthSession();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authFetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 401) clearLegacyAuthSession();
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
  const form = new FormData();
  form.append("file", file);
  form.append("assetType", options.assetType ?? "original_photo");
  if (options.designId) form.append("designId", options.designId);
  if (options.aiPrompt) form.append("aiPrompt", options.aiPrompt);
  if (options.aiStyle) form.append("aiStyle", options.aiStyle);
  const response = await authFetch("/api/design-assets", { method: "POST", body: form });

  const payload = await response.json().catch(() => null);

  if (response.status === 401) clearLegacyAuthSession();
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
