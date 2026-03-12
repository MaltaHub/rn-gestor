import type { Session } from "@supabase/supabase-js";

export const AUTH_SESSION_HINT_COOKIE = "rn-gestor-has-session";

const SESSION_HINT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function syncBrowserSessionHint(session: Session | null) {
  if (typeof document === "undefined") return;

  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";

  if (!session?.access_token) {
    document.cookie = `${AUTH_SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }

  document.cookie = `${AUTH_SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${SESSION_HINT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
