import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import {
  getAuditoriaMeta,
  listAuditoria,
  type AuditListFilters,
  type AuditOrigin
} from "@/lib/domain/auditoria/service";
import type { AuditAction } from "@/lib/domain/auditoria/changes";
import { isAuditedTable } from "@/lib/domain/auditoria/tables";

const ACTIONS: AuditAction[] = ["INSERT", "UPDATE", "DELETE"];
const ORIGINS: AuditOrigin[] = ["usuario", "sistema"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = /^[A-Za-z0-9._:-]{1,80}$/;

function invalid(message: string): never {
  throw new ApiHttpError(400, "INVALID_FILTER", message);
}

function readFilters(params: URLSearchParams): AuditListFilters {
  const value = (key: string) => params.get(key)?.trim() || null;

  const tabela = value("tabela");
  if (tabela && !isAuditedTable(tabela)) invalid("Tabela fora da auditoria.");
  const acao = value("acao");
  if (acao && !ACTIONS.includes(acao as AuditAction)) invalid("Ação inválida.");
  const origem = value("origem");
  if (origem && !ORIGINS.includes(origem as AuditOrigin)) invalid("Origem inválida.");
  const autorId = value("autor");
  if (autorId && !UUID.test(autorId)) invalid("Autor inválido.");
  const de = value("de");
  const ate = value("ate");
  if ((de && !DAY.test(de)) || (ate && !DAY.test(ate))) invalid("Data inválida (use AAAA-MM-DD).");
  const lote = value("lote");
  if (lote && !BATCH.test(lote)) invalid("Lote inválido.");
  const pk = value("pk");
  if (pk && pk.length > 200) invalid("Registro inválido.");

  return {
    tabela,
    acao: acao as AuditAction | null,
    origem: origem as AuditOrigin | null,
    autorId,
    q: value("q"),
    de,
    ate,
    lote,
    pk
  };
}

/**
 * GET /api/v1/auditoria — alterações (mais novas primeiro), paginadas por cursor.
 * Filtros: tabela, acao, origem (usuario|sistema), autor (id), q (texto/placa), de/ate, lote, pk.
 * `meta=1` devolve também tabelas auditadas, autores e a regra de retenção.
 */
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "GERENTE", async ({ requestId, supabase }) => {
    const params = req.nextUrl.searchParams;
    const filters = readFilters(params);
    const limitParam = params.get("limite");
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) invalid("Limite entre 1 e 100.");

    const [result, meta] = await Promise.all([
      listAuditoria({ supabase, filters, cursor: params.get("cursor"), limit }),
      params.get("meta") === "1" ? getAuditoriaMeta(supabase) : Promise.resolve(null)
    ]);

    return apiOk({ ...result, meta }, { request_id: requestId });
  });
}
