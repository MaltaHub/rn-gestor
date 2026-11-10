import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api/auth";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { parsePagination } from "@/lib/api/request";
import { apiOk } from "@/lib/api/response";
import { contarSituacoes, listVeiculosVendedor } from "@/lib/domain/vendedor/service";
import { ORDENS_LISTA, SITUACAO_FILTROS, type ListaVeiculosVendedor, type OrdemLista, type SituacaoFiltro } from "@/lib/domain/vendedor/types";

// GET /api/v1/vendedor/veiculos?situacao=&q=&ordem=&page=&page_size=&contagens=1
// Lista do vendedor (/vender e /word). `contagens=1` traz o total por situação;
// `ordem=recentes` põe na frente o que ESTE usuário manipulou por último.
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "VENDEDOR");
    const { page, pageSize } = parsePagination(req);
    const params = req.nextUrl.searchParams;
    const situacaoParam = params.get("situacao") ?? "disponivel";
    const situacao: SituacaoFiltro = (SITUACAO_FILTROS as string[]).includes(situacaoParam)
      ? (situacaoParam as SituacaoFiltro)
      : "disponivel";
    const ordemParam = params.get("ordem");
    const ordem = (ORDENS_LISTA as string[]).includes(ordemParam ?? "") ? (ordemParam as OrdemLista) : null;

    const [result, contagens] = await Promise.all([
      listVeiculosVendedor({ supabase, situacao, q: params.get("q"), page, pageSize, ordem, usuarioId: actor.userId }),
      params.get("contagens") === "1" ? contarSituacoes(supabase) : Promise.resolve(null)
    ]);

    const data: ListaVeiculosVendedor = { itens: result.rows, total: result.total, contagens };
    return apiOk(data, { request_id: requestId, page, page_size: pageSize, total: result.total });
  });
}
