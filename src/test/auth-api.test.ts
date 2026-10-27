import { afterEach, describe, expect, it, vi } from "vitest";
import { authFetch, getAuthSession } from "@/lib/api/auth";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("cookie-backed authentication client", () => {
  it("sends cookies and never forwards an Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await authFetch("/api/private", {
      headers: { Authorization: "Bearer must-not-be-forwarded" },
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.credentials).toBe("include");
    expect(new Headers(request.headers).has("Authorization")).toBe(false);
  });

  it("checks authentication with the server and caches only the user identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, user: { id: "user-1", email: "u@example.test" } }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAuthSession()).resolves.toEqual({ id: "user-1", email: "u@example.test" });
    expect(localStorage.getItem("bhasi-auth-session")).toBeNull();
  });
});
