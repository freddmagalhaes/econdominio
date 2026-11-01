import { createHash, randomBytes } from "node:crypto";

/** O banco só guarda o hash: o token em texto existe apenas no link enviado por e-mail. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const RE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function urlBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
