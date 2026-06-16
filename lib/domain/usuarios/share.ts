import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiHttpError } from "@/lib/api/errors";

/**
 * Token de vendedor (HMAC stateless) para personalizar o WhatsApp das páginas
 * públicas (catálogo/galeria). Identifica o `usuarios_acesso.id` do vendedor que
 * compartilhou o link — NÃO concede acesso a nada protegido; só escolhe o
 * número/foto/nome exibidos. Espelha o padrão de `lib/domain/carros/share.ts`.
 */

function shareSecret(): string {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new ApiHttpError(500, "SHARE_SECRET_MISSING", "Segredo do servidor ausente para gerar o link.");
  }
  return secret;
}

function sign(payload: string): string {
  // Domínio separado do token de carro (prefixo) para os HMACs não colidirem.
  return createHmac("sha256", shareSecret()).update(`vendedor:${payload}`).digest("base64url");
}

/** Token determinístico do vendedor (não enumerável, não forjável). */
export function createVendedorShareToken(usuarioId: string): string {
  const payload = Buffer.from(usuarioId, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Valida a assinatura e devolve o usuarioId, ou null se inválido. */
export function resolveVendedorShareToken(token: string): { usuarioId: string } | null {
  const [payload, sig] = (token ?? "").split(".");
  if (!payload || !sig) return null;

  const expected = sign(payload);
  const provided = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
    return null;
  }

  try {
    const usuarioId = Buffer.from(payload, "base64url").toString("utf8");
    return usuarioId ? { usuarioId } : null;
  } catch {
    return null;
  }
}
