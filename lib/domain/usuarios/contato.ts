import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Contato do vendedor para o WhatsApp por-vendedor das páginas públicas.
 * Quando o vendedor não preencheu o telefone, o número padrão da loja é usado.
 */

// Número/telefone PADRÃO da loja (fallback). Centralizados aqui para o catálogo,
// a galeria e a tarja (LojaContato) compartilharem a mesma fonte.
export const WHATSAPP_PADRAO = "5513974069303";
export const TELEFONE_PADRAO_LABEL = "(13) 3474-4560";
export const TELEFONE_PADRAO_TEL = "+551334744560";

export type VendedorContato = {
  nome: string;
  foto: string | null;
  telefone: string | null;
};

/** Só dígitos; prefixa 55 (BR) quando vem sem DDI. Null quando não dá número. */
export function whatsappNumberFromTelefone(telefone: string | null | undefined): string | null {
  const digits = String(telefone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null; // DDD + número, no mínimo
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

/** Número de WhatsApp do vendedor (se válido) ou o padrão da loja. */
export function resolveWhatsappNumber(telefone: string | null | undefined): string {
  return whatsappNumberFromTelefone(telefone) ?? WHATSAPP_PADRAO;
}

/** Lê nome/foto/telefone do vendedor (catálogo/galeria). Null se não existir. */
export async function loadVendedorContato(
  supabase: SupabaseClient<Database>,
  usuarioId: string
): Promise<VendedorContato | null> {
  const { data, error } = await supabase
    .from("usuarios_acesso")
    .select("nome, foto, telefone")
    .eq("id", usuarioId)
    .maybeSingle();

  if (error || !data) return null;
  return { nome: data.nome, foto: data.foto, telefone: data.telefone };
}
