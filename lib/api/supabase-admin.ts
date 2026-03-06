import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ApiHttpError } from "@/lib/api/errors";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    throw new ApiHttpError(500, "SUPABASE_ENV_MISSING", "Variaveis de ambiente do Supabase ausentes.");
  }

  return createClient<Database>(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
