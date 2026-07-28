import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const SUPABASE_BROWSER_FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SUPABASE_BROWSER_FETCH_TIMEOUT_MS);
  const upstreamSignal = init?.signal;

  if (upstreamSignal) {
    upstreamSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

// Singleton: cada createClient() instancia um GoTrueClient proprio. Varios deles
// compartilhando o mesmo storage key disputam o token da URL (o link de
// recuperacao/magic link e' de uso unico) e se atropelam no refresh de sessao.
// Uma instancia por aba resolve — e' o que o supabase-js espera.
let browserClient: SupabaseClient<Database> | null = null;

export function createSupabaseBrowserClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  if (browserClient) return browserClient;

  browserClient = createClient<Database>(url, anonKey, {
    global: {
      fetch: fetchWithTimeout
    }
  });

  return browserClient;
}
