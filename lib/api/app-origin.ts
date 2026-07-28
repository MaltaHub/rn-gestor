import type { NextRequest } from "next/server";

/**
 * Origem publica da aplicacao (https://host, sem barra final).
 *
 * NEXT_PUBLIC_SITE_URL nao esta definida em lugar nenhum deste projeto, e quando
 * ela faltava o redirectTo saia relativo ("/redefinir-senha"). O Supabase
 * descarta redirect que nao casa com a allow-list e cai no Site URL — o link de
 * recuperacao virava um magic link que jogava o usuario na home ja logado, sem
 * nunca mostrar o formulario de nova senha. Por isso a origem do proprio request
 * e' o fallback: funciona em prod, em preview da Vercel e em localhost.
 */
export function resolveAppOrigin(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (forwardedHost) {
    const proto = req.headers.get("x-forwarded-proto") ?? (forwardedHost.startsWith("localhost") ? "http" : "https");
    return `${proto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  return req.nextUrl.origin.replace(/\/+$/, "");
}
