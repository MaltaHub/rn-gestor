import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { humanizeColumn } from "@/lib/domain/column-labels";
import { auditVehicle, buildAuditChanges, type AuditAction, type AuditChange } from "@/lib/domain/auditoria/changes";
import { AUDIT_RETENTION, AUDITED_TABLES, auditTableLabel, type AuditTable } from "@/lib/domain/auditoria/tables";
import type { Database } from "@/lib/supabase/database.types";

type DomainSupabase = SupabaseClient<Database>;
type AuditRow = Database["public"]["Tables"]["log_alteracoes"]["Row"];

export const AUDIT_SYSTEM_AUTHOR = "SISTEMA";
export const AUDIT_PAGE_SIZE = 50;

export type AuditOrigin = "usuario" | "sistema";

export type AuditListFilters = {
  tabela?: string | null;
  acao?: AuditAction | null;
  origem?: AuditOrigin | null;
  autorId?: string | null;
  q?: string | null;
  /** YYYY-MM-DD (dia inteiro, horário de Brasília). */
  de?: string | null;
  ate?: string | null;
  lote?: string | null;
  pk?: string | null;
};

export type AuditChangeView = AuditChange & { label: string; beforeText?: string; afterText?: string };

export type AuditEntry = {
  id: string;
  at: string;
  action: string;
  table: string;
  tableLabel: string;
  pk: string | null;
  placa: string | null;
  carroId: string | null;
  author: { id: string | null; name: string; role: string | null; system: boolean };
  details: string | null;
  batchId: string | null;
  inBatch: boolean;
  changes: AuditChangeView[];
};

export type AuditListResult = { entries: AuditEntry[]; nextCursor: string | null; total: number | null };

export type AuditMeta = {
  tables: readonly AuditTable[];
  authors: Array<{ id: string; name: string }>;
  retention: typeof AUDIT_RETENTION;
};

// ------------------------------------------------------------------ cursor (data_hora + id)

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeAuditCursor(row: { data_hora: string; id: string }) {
  return Buffer.from(JSON.stringify({ t: row.data_hora, id: row.id }), "utf8").toString("base64url");
}

export function decodeAuditCursor(cursor: string): { t: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { t?: unknown; id?: unknown };
    if (typeof parsed.t === "string" && CURSOR_TIME.test(parsed.t) && typeof parsed.id === "string" && UUID.test(parsed.id)) {
      return { t: parsed.t, id: parsed.id };
    }
  } catch {
    // cai no erro abaixo
  }
  throw new ApiHttpError(400, "INVALID_CURSOR", "Cursor de paginação inválido.");
}

// ------------------------------------------------------------------ nomes dos ids (FK)

type LabelSource = { table: keyof Database["public"]["Tables"]; column: string };

const FK_LABELS: Record<string, LabelSource> = {
  modelo_id: { table: "modelos", column: "modelo" },
  responsavel_virado_id: { table: "responsaveis_virado", column: "nome" },
  remetente_id: { table: "remetentes", column: "nome" },
  pasta_id: { table: "arquivos_pastas", column: "nome" },
  parent_folder_id: { table: "arquivos_pastas", column: "nome" },
  folder_id: { table: "arquivos_pastas", column: "nome" },
  repository_folder_id: { table: "arquivos_pastas", column: "nome" },
  uploaded_by: { table: "usuarios_acesso", column: "nome" },
  created_by: { table: "usuarios_acesso", column: "nome" },
  created_by_user_id: { table: "usuarios_acesso", column: "nome" },
  template_id: { table: "documento_templates", column: "titulo" },
  arquivo_id: { table: "arquivos_arquivos", column: "nome_arquivo" },
  arquivo_exemplo_id: { table: "arquivos_arquivos", column: "nome_arquivo" },
  foto_capa_id: { table: "arquivos_arquivos", column: "nome_arquivo" },
  carro_id: { table: "carros", column: "placa" }
};

function labelSourceFor(table: string, field: string): LabelSource | null {
  if (field === "caracteristica_id") {
    if (table === "carro_caracteristicas_visuais") return { table: "caracteristicas_visuais", column: "caracteristica" };
    if (table === "carro_caracteristicas_tecnicas") return { table: "caracteristicas_tecnicas", column: "caracteristica" };
    return null;
  }
  return FK_LABELS[field] ?? null;
}

/** Nomes por "tabela.coluna:id", buscados em lote (no máximo 200 ids por tabela). */
async function resolveLabels(supabase: DomainSupabase, wanted: Map<string, Set<string>>) {
  const labels = new Map<string, string>();
  await Promise.all(
    Array.from(wanted.entries()).map(async ([sourceKey, ids]) => {
      const [table, column] = sourceKey.split(".");
      const list = Array.from(ids).slice(0, 200);
      if (list.length === 0) return;
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from(table)
        .select(`id, ${column}`)
        .in("id", list);
      if (error) {
        console.error("[AUDIT_LABELS_FAILED]", { table, error });
        return;
      }
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const value = row[column];
        if (typeof value === "string" && value.trim()) labels.set(`${sourceKey}:${String(row.id)}`, value.trim());
      }
    })
  );
  return labels;
}

// ------------------------------------------------------------------ busca

/** Texto livre seguro para o filtro `or` do PostgREST (sem vírgula/parênteses/aspas/curinga). */
export function sanitizeAuditSearch(value: string | null | undefined) {
  return (value ?? "").replace(/[,()"'\\*%:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function plateNeedle(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Início do dia em Brasília (UTC−3, sem horário de verão desde 2019). */
function dayStartIso(day: string) {
  return `${day}T00:00:00-03:00`;
}

function dayEndIso(day: string) {
  return `${day}T23:59:59.999-03:00`;
}

// ------------------------------------------------------------------ listagem

export async function listAuditoria(input: {
  supabase: DomainSupabase;
  filters: AuditListFilters;
  cursor?: string | null;
  limit?: number;
}): Promise<AuditListResult> {
  const { supabase, filters } = input;
  const limit = Math.min(Math.max(input.limit ?? AUDIT_PAGE_SIZE, 1), 100);
  const cursor = input.cursor ? decodeAuditCursor(input.cursor) : null;

  let query = supabase
    .from("log_alteracoes")
    .select("*", cursor ? undefined : { count: "exact" })
    .order("data_hora", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (filters.tabela) query = query.eq("tabela", filters.tabela);
  if (filters.acao) query = query.eq("acao", filters.acao);
  if (filters.origem === "sistema") query = query.eq("autor", AUDIT_SYSTEM_AUTHOR);
  if (filters.origem === "usuario") query = query.neq("autor", AUDIT_SYSTEM_AUTHOR);
  if (filters.autorId) query = query.eq("autor_usuario_id", filters.autorId);
  if (filters.lote) query = query.eq("lote_id", filters.lote);
  if (filters.pk) query = query.eq("pk", filters.pk);
  if (filters.de) query = query.gte("data_hora", dayStartIso(filters.de));
  if (filters.ate) query = query.lte("data_hora", dayEndIso(filters.ate));

  const search = sanitizeAuditSearch(filters.q);
  if (search) {
    const clauses = [`detalhes.ilike."*${search}*"`, `autor.ilike."*${search}*"`, `pk.ilike."*${search}*"`];
    const plate = plateNeedle(search);
    if (plate.length >= 3) {
      clauses.push(
        `dados_novos->__veiculo->>placa.ilike."*${plate}*"`,
        `dados_anteriores->__veiculo->>placa.ilike."*${plate}*"`,
        `dados_novos->>placa.ilike."*${plate}*"`,
        `dados_anteriores->>placa.ilike."*${plate}*"`
      );
    }
    query = query.or(clauses.join(","));
  }

  if (cursor) {
    query = query.or(`data_hora.lt."${cursor.t}",and(data_hora.eq."${cursor.t}",id.lt.${cursor.id})`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[AUDIT_LIST_FAILED]", { error });
    throw new ApiHttpError(500, "AUDIT_LIST_FAILED", "Falha ao carregar a auditoria.");
  }

  const rows = (data ?? []) as AuditRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const entries = await toEntries(supabase, page);

  return {
    entries,
    nextCursor: rows.length > limit && last ? encodeAuditCursor(last) : null,
    total: cursor ? null : count ?? null
  };
}

async function toEntries(supabase: DomainSupabase, rows: AuditRow[]): Promise<AuditEntry[]> {
  const base = rows.map((row) => {
    const vehicle = auditVehicle(row.tabela, row.pk, row.dados_anteriores, row.dados_novos);
    const changes = buildAuditChanges(row.acao, row.dados_anteriores, row.dados_novos);
    return { row, vehicle, changes };
  });

  // Nomes dos ids citados (modelo, titular, pasta…) e placas que faltam (logs antigos).
  const wanted = new Map<string, Set<string>>();
  const want = (source: LabelSource, id: unknown) => {
    if (typeof id !== "string" || !UUID.test(id)) return;
    const key = `${source.table}.${source.column}`;
    if (!wanted.has(key)) wanted.set(key, new Set());
    wanted.get(key)!.add(id);
  };
  for (const { row, vehicle, changes } of base) {
    if (!vehicle.placa && vehicle.carroId) want(FK_LABELS.carro_id, vehicle.carroId);
    for (const change of changes) {
      const source = labelSourceFor(row.tabela, change.field);
      if (!source) continue;
      want(source, change.before);
      want(source, change.after);
    }
  }
  const labels = wanted.size > 0 ? await resolveLabels(supabase, wanted) : new Map<string, string>();
  const labelOf = (source: LabelSource | null, value: unknown) =>
    source && typeof value === "string" ? labels.get(`${source.table}.${source.column}:${value}`) : undefined;

  return base.map(({ row, vehicle, changes }) => {
    const system = row.autor === AUDIT_SYSTEM_AUTHOR || row.autor.toLowerCase() === "sistema";
    return {
      id: row.id,
      at: row.data_hora,
      action: row.acao,
      table: row.tabela,
      tableLabel: auditTableLabel(row.tabela),
      pk: row.pk,
      placa: vehicle.placa ?? labelOf(FK_LABELS.carro_id, vehicle.carroId) ?? null,
      carroId: vehicle.carroId,
      author: { id: row.autor_usuario_id, name: system ? AUDIT_SYSTEM_AUTHOR : row.autor, role: row.autor_cargo, system },
      details: row.detalhes,
      batchId: row.lote_id,
      inBatch: row.em_lote,
      changes: changes
        .map((change) => {
          const source = labelSourceFor(row.tabela, change.field);
          return {
            ...change,
            label: humanizeColumn(change.field),
            beforeText: labelOf(source, change.before),
            afterText: labelOf(source, change.after)
          };
        })
        .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"))
    };
  });
}

// ------------------------------------------------------------------ filtros

export async function getAuditoriaMeta(supabase: DomainSupabase): Promise<AuditMeta> {
  const { data, error } = await supabase.from("usuarios_acesso").select("id, nome").order("nome", { ascending: true });
  if (error) {
    console.error("[AUDIT_META_FAILED]", { error });
    throw new ApiHttpError(500, "AUDIT_META_FAILED", "Falha ao carregar os filtros da auditoria.");
  }
  return {
    tables: AUDITED_TABLES,
    authors: (data ?? []).map((user) => ({ id: user.id, name: String(user.nome ?? "") })),
    retention: AUDIT_RETENTION
  };
}
