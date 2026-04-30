import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "@/middleware";
import { AUTH_SESSION_HINT_COOKIE } from "@/lib/supabase/session-hint";

describe("auth middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("covers all authenticated pages", () => {
    expect(config.matcher).toEqual([
      "/",
      "/admin/:path*",
      "/arquivos/:path*",
      "/auditoria/:path*",
      "/perfil/:path*",
      "/playground/:path*",
      "/price-contexts/:path*"
    ]);
  });

  it("redirects protected production routes without session hint to login with next path", () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = middleware(new NextRequest("https://rn-gestor.test/playground?tab=feeds"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://rn-gestor.test/login?next=%2Fplayground%3Ftab%3Dfeeds");
  });

  it("allows protected production routes when the browser has a session hint", () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = middleware(
      new NextRequest("https://rn-gestor.test/playground", {
        headers: {
          cookie: `${AUTH_SESSION_HINT_COOKIE}=1`
        }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
