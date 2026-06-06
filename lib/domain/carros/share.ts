import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiHttpError } from "@/lib/api/errors";

/**
 * Link de compartilhamento de fotos: token HMAC stateless e FIXO por veículo
 * (mesmo carro ⇒ mesmo link, sem expiração). A validade do link é governada
 * pelo estado de venda — a galeria pública (`/galeria/[token]`) bloqueia o acesso
 * quando o veículo deixa de estar disponível (vendido). Sem login e sem expor
 * documentos.
 */

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

/** Token determinístico do veículo (não enumerável, não forjável). */
export function createCarroShareToken(carroId: string): string {
  const payload = Buffer.from(carroId, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Valida assinatura e devolve o carroId, ou null se inválido. */
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
    const carroId = Buffer.from(payload, "base64url").toString("utf8");
    return carroId ? { carroId } : null;
  } catch {
    return null;
  }
}
