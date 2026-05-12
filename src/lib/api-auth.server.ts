// Shared API key auth helper for /api/v1/* routes
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function authenticateApiKey(request: Request): Promise<
  { ok: true; keyId: string } | { ok: false; response: Response }
> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !token.startsWith("hh_")) {
    return { ok: false, response: jsonError(401, "missing_or_invalid_api_key") };
  }
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const keyHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (error || !data || data.revoked_at) {
    return { ok: false, response: jsonError(401, "invalid_api_key") };
  }
  // Fire and forget last_used_at
  supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { ok: true, keyId: data.id };
}

export function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: { code, message: message ?? code } }), {
    status,
    headers: corsJsonHeaders(),
  });
}

export function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsJsonHeaders() });
}

export function corsJsonHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
  };
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: corsJsonHeaders() });
}
