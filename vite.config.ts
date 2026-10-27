import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiBaseUrl = process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL;

  if (mode === "production") {
    if (!apiBaseUrl) {
      throw new Error("VITE_API_BASE_URL must be set before building the production storefront.");
    }

    let apiUrl: URL;
    try {
      apiUrl = new URL(apiBaseUrl);
    } catch {
      throw new Error("VITE_API_BASE_URL must be an absolute HTTPS API origin.");
    }

    if (apiUrl.protocol !== "https:" || apiUrl.origin !== apiBaseUrl.replace(/\/$/, "")) {
      throw new Error("VITE_API_BASE_URL must be an HTTPS origin without a path.");
    }
  }

  return {
    nitro: {
      preset: "node-server",
    },
    tanstackStart: {
      server: { entry: "server" },
    },
  };
});
