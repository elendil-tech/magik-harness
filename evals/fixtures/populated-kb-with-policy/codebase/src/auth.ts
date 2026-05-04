/**
 * codebase/src/auth.ts — public auth surface.
 *
 * Per knowledge/engineering/auth-policy.md, this module issues stateless
 * JWTs. Do not introduce server-side session storage here.
 */

import { issue, verify } from "../lib/jwt.js";

export interface AuthTokenPayload {
  sub: string;
  iat: number;
  exp: number;
  role: "user" | "admin";
}

const ACCESS_TTL_SECONDS = 15 * 60;

export function issueAccessToken(userId: string, role: "user" | "admin" = "user"): string {
  const now = Math.floor(Date.now() / 1000);
  return issue<AuthTokenPayload>({
    sub: userId,
    iat: now,
    exp: now + ACCESS_TTL_SECONDS,
    role,
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  return verify<AuthTokenPayload>(token);
}
