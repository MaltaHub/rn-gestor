import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_SESSION_HINT_COOKIE } from "@/lib/supabase/session-hint";
import { PASSWORD_RECOVERY_PATH } from "@/lib/domain/password-policy";

function hasSessionHint(req: NextRequest) {
  return req.cookies.get(AUTH_SESSION_HINT_COOKIE)?.value === "1";
}

/**
 * Link de recuperação que caiu na página errada.
 *
 * O botão "Reset password" do dashboard do Supabase não passa redirect, e o
 * GoTrue então PREENCHE o redirect com o próprio Site URL — ou seja, o link
 * chega na home com `?token_hash=...&type=recovery`. Sem sessão, a home mandava
 * pro login e o usuário nunca via o formulário de nova senha.
 *
 * Aqui os parâmetros são encaminhados intactos pra página de redefinição, então
 * o link funciona independente de onde tenha aterrissado.
 */
function resolveRecoveryRedirect(req: NextRequest) {
  if (req.nextUrl.pathname === PASSWORD_RECOVERY_PATH) return null;

  const params = req.nextUrl.searchParams;
  if (params.get("type") !== "recovery") return null;
  if (!params.get("token_hash") && !params.get("code")) return null;

  const url = req.nextUrl.clone();
  url.pathname = PASSWORD_RECOVERY_PATH;
  return url;
}

export function middleware(req: NextRequest) {
  // Antes de qualquer checagem de sessão: quem chega com token de recuperação
  // ainda NAO tem sessao, e mandar pro login perderia o token.
  const recoveryUrl = resolveRecoveryRedirect(req);
  if (recoveryUrl) {
    return NextResponse.redirect(recoveryUrl);
  }

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  if (hasSessionHint(req)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;

  if (nextPath !== "/") {
    loginUrl.searchParams.set("next", nextPath);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/arquivos/:path*",
    "/auditoria/:path*",
    "/perfil/:path*",
    "/playground/:path*",
    "/price-contexts/:path*",
    "/vendedor/:path*"
  ]
};
