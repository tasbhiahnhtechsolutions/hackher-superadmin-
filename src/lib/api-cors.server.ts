// CORS + JSON helpers for public customer APIs.
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
export function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsJsonHeaders() });
}
export function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: { code, message: message ?? code } }), {
    status, headers: corsJsonHeaders(),
  });
}
