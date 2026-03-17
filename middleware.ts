import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_SESSION_HINT_COOKIE } from "@/lib/supabase/session-hint";

function hasSessionHint(req: NextRequest) {
  return req.cookies.get(AUTH_SESSION_HINT_COOKIE)?.value === "1";
}

export function middleware(req: NextRequest) {
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
  matcher: ["/", "/arquivos/:path*", "/admin/:path*"]
};
