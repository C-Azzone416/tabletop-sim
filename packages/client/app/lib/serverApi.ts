// #252 — pre-launch access gate. The server rejects any request to its API
// surface (besides /health, /healthz) that doesn't carry the shared secret,
// so every client call site needs it attached. The secret is intentionally
// a NEXT_PUBLIC_ var (shipped in the browser bundle): it's a coarse
// pre-launch bouncer against drive-by crawlers hitting the bare API, not a
// substitute for real per-user auth — see docs/access-control.md.
export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

const API_ACCESS_KEY = process.env.NEXT_PUBLIC_API_ACCESS_KEY;

// For plain HTTP fetches — merges the x-api-key header in alongside whatever
// headers the caller already sends. No-op (gate disabled) when the key isn't
// configured, matching the server's own default-open-in-dev behavior.
export function apiHeaders(base: Record<string, string> = {}): Record<string, string> {
  return API_ACCESS_KEY ? { ...base, "x-api-key": API_ACCESS_KEY } : base;
}

// For the WebSocket upgrade — browsers can't set custom headers on the
// handshake, so the same secret rides as a query param instead, read by the
// server's identical gate hook.
export function withApiKeyParam(params: URLSearchParams): URLSearchParams {
  if (API_ACCESS_KEY) params.set("apiKey", API_ACCESS_KEY);
  return params;
}
