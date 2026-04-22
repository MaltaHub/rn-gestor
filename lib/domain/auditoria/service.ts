import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { Database } from "@/lib/supabase/database.types";
import type { AuditRow } from "@/lib/domain/db";

type DomainSupabase = SupabaseClient<Database>;

export type ListAuditoriaInput = {
  supabase: DomainSupabase;
  page: number;
  pageSize: number;
  tabela?: string | null;
  acao?: string | null;
};

export type ListAuditoriaOutput = {
  rows: AuditRow[];
  total: number;
};

export async function listAuditoria(input: ListAuditoriaInput): Promise<ListAuditoriaOutput> {
  const { supabase, page, pageSize, tabela, acao } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  let query = supabase.from("log_alteracoes").select("*", { count: "exact" }).order("data_hora", { ascending: false });

  if (tabela?.trim()) query = query.eq("tabela", tabela.trim());
  if (acao?.trim()) query = query.eq("acao", acao.trim());

  const { data, error, count } = await query.range(from, to);
  if (error) throw new ApiHttpError(500, "AUDIT_LIST_FAILED", "Falha ao listar auditoria.", error);

  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
}
