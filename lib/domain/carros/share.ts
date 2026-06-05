import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiHttpError } from "@/lib/api/errors";

/**
 * Links de compartilhamento de fotos: token HMAC stateless (sem tabela).
 * O token carrega `{ carroId, exp }` assinado com o segredo do servidor; a
 * galeria pública (`/galeria/[token]`) valida assinatura + validade e então
 * assina as URLs das fotos na hora. Sem login e sem expor documentos.
 */

const MIN_MINUTES = 5;
const MAX_MINUTES = 60 * 24 * 30; // 30 dias

export function clampShareMinutes(minutes: unknown): number {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return 60;
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(value)));
}

function shareSecret(): string {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new ApiHttpError(500, "SHARE_SECRET_MISSING", "Segredo do servidor ausente para gerar o link.");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", shareSecret()).update(payload).digest("base64url");
}

export type CarroShareToken = { token: string; expiresAt: string };

export function createCarroShareToken(carroId: string, expiresInMinutes: number): CarroShareToken {
  const exp = Date.now() + clampShareMinutes(expiresInMinutes) * 60_000;
  const payload = Buffer.from(JSON.stringify({ c: carroId, e: exp }), "utf8").toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp).toISOString() };
}

/** Valida assinatura + validade; retorna o carroId ou null (inválido/expirado). */
export function resolveCarroShareToken(token: string): { carroId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = sign(payload);
  const provided = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { c?: unknown; e?: unknown };
    if (typeof decoded.c !== "string" || typeof decoded.e !== "number") return null;
    if (decoded.e < Date.now()) return null;
    return { carroId: decoded.c };
  } catch {
    return null;
  }
}
