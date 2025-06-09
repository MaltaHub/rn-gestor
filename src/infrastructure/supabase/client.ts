// src/infrastructure/supabase/client.ts

import { createClient } from '@supabase/supabase-js';

// As variáveis de ambiente devem estar definidas no seu .env
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Variáveis de ambiente Supabase não encontradas');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
