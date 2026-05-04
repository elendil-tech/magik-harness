/**
 * codebase/src/middleware.ts — request auth middleware.
 *
 * Verifies the JWT in the Authorization header and attaches the payload
 * to the request. Stateless by design — no DB lookup per request.
 */

import { verifyAccessToken, type AuthTokenPayload } from "./auth.js";

export interface AuthedRequest {
  headers: Record<string, string | undefined>;
  auth?: AuthTokenPayload;
}

export function requireAuth(req: AuthedRequest): { ok: true } | { ok: false; status: 401 } {
  const header = req.headers["authorization"] ?? req.headers["Authorization"];
  if (!header?.startsWith("Bearer ")) return { ok: false, status: 401 };
  const token = header.slice("Bearer ".length).trim();
  const payload = verifyAccessToken(token);
  if (!payload) return { ok: false, status: 401 };
  req.auth = payload;
  return { ok: true };
}
