import { API_BASE_URL } from "./base-url";

export type AuthUser = {
  id: string;
  email?: string;
};

let currentUser: AuthUser | null = null;
let sessionChecked = false;

export function setCurrentAuthUser(user: AuthUser | null) {
  currentUser = user;
  sessionChecked = true;
}

export function hasAuthSession() {
  return sessionChecked && currentUser !== null;
}

export async function authFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.delete("Authorization");

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
}

export async function getAuthSession(): Promise<AuthUser | null> {
  let response: Response;
  try {
    response = await authFetch("/api/auth/session");
  } catch {
    setCurrentAuthUser(null);
    throw new Error("Unable to verify your sign-in session. Check your connection and try again.");
  }

  if (response.status === 401) {
    setCurrentAuthUser(null);
    return null;
  }
  if (!response.ok) {
    setCurrentAuthUser(null);
    throw new Error(`Unable to verify your sign-in session (HTTP ${response.status}).`);
  }

  let result: { success?: boolean; user?: AuthUser };
  try {
    result = (await response.json()) as { success?: boolean; user?: AuthUser };
  } catch {
    setCurrentAuthUser(null);
    throw new Error("The authentication service returned an invalid session.");
  }
  if (!result.success || !result.user?.id) {
    setCurrentAuthUser(null);
    throw new Error("The authentication service returned an invalid session.");
  }
  setCurrentAuthUser(result.user);
  return result.user;
}

export async function signOut() {
  try {
    const response = await authFetch("/api/auth/logout", { method: "POST" });
    if (!response.ok && response.status !== 401) {
      throw new Error("Unable to end your session. Please try again.");
    }
  } finally {
    localStorage.removeItem("bhasi-auth-session");
    setCurrentAuthUser(null);
  }
}

export function clearLegacyAuthSession() {
  localStorage.removeItem("bhasi-auth-session");
}

if (typeof window !== "undefined") clearLegacyAuthSession();
