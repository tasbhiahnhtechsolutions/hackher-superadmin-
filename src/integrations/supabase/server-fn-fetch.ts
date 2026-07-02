// Client-only: inject the Supabase access token into server function calls.
import { supabase } from "./client";

let installed = false;

export function installServerFnAuthFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url && url.includes("/_serverFn/")) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const headers = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
          );
          if (!headers.has("authorization")) {
            headers.set("authorization", `Bearer ${token}`);
          }
          return originalFetch(input as RequestInfo, { ...init, headers });
        }
      }
    } catch (e) {
      console.error("[server-fn auth fetch] failed to attach token", e);
    }
    return originalFetch(input as RequestInfo, init);
  };
}
