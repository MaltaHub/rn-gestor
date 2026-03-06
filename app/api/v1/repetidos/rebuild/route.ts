import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { executeApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { getActorContext, requireRole } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";

type CarroLite = {
  id: string;
  modelo_id: string;
  cor: string | null;
  ano_mod: number | null;
  preco_original: number | null;
  hodometro: number | null;
};

export async function POST(req: NextRequest) {
  return executeApi(req, async ({ requestId }) => {
    const actor = getActorContext(req);
    requireRole(actor, "GERENTE");

    const supabase = getSupabaseAdmin();
    const { data: carros, error: carrosError } = await supabase
      .from("carros")
      .select("id, modelo_id, cor, ano_mod, preco_original, hodometro")
      .eq("em_estoque", true);

    if (carrosError) {
      throw new ApiHttpError(500, "REBUILD_READ_FAILED", "Falha ao carregar carros para rebuild.", carrosError);
    }

    const groups = new Map<string, CarroLite[]>();
    for (const car of (carros ?? []) as CarroLite[]) {
      const key = [car.modelo_id, car.cor ?? "", String(car.ano_mod ?? ""), String(car.preco_original ?? "")].join("|");
      const list = groups.get(key) ?? [];
      list.push(car);
      groups.set(key, list);
    }

    const duplicatedGroups = Array.from(groups.values()).filter((group) => group.length > 1);

    const deleteRepetidos = await supabase.from("repetidos").delete().neq("carro_id", "");
    if (deleteRepetidos.error) {
      throw new ApiHttpError(500, "REBUILD_DELETE_FAILED", "Falha ao limpar repetidos.", deleteRepetidos.error);
    }

    const deleteGroups = await supabase.from("grupos_repetidos").delete().neq("grupo_id", "");
    if (deleteGroups.error) {
      throw new ApiHttpError(500, "REBUILD_DELETE_FAILED", "Falha ao limpar grupos_repetidos.", deleteGroups.error);
    }

    const gruposPayload = duplicatedGroups.map((group) => {
      const first = group[0];
      const hodometros = group.map((x) => x.hodometro ?? 0);
      const precos = group.map((x) => x.preco_original ?? 0);

      return {
        grupo_id: randomUUID(),
        modelo_id: first.modelo_id,
        cor: first.cor ?? "",
        ano_mod: first.ano_mod,
        preco_original: first.preco_original,
        preco_min: Math.min(...precos),
        preco_max: Math.max(...precos),
        hodometro_min: Math.min(...hodometros),
        hodometro_max: Math.max(...hodometros),
        qtde: group.length,
        atualizado_em: new Date().toISOString()
      };
    });

    let insertedGroups: { grupo_id: string }[] = [];

    if (gruposPayload.length > 0) {
      const { data, error } = await supabase.from("grupos_repetidos").insert(gruposPayload).select("grupo_id");
      if (error) {
        throw new ApiHttpError(500, "REBUILD_INSERT_GROUPS_FAILED", "Falha ao inserir grupos_repetidos.", error);
      }
      insertedGroups = data ?? [];
    }

    const repetidosPayload = duplicatedGroups.flatMap((group, index) => {
      const gid = insertedGroups[index]?.grupo_id;
      if (!gid) return [];
      return group.map((car) => ({ grupo_id: gid, carro_id: car.id }));
    });

    if (repetidosPayload.length > 0) {
      const { error } = await supabase.from("repetidos").insert(repetidosPayload);
      if (error) {
        throw new ApiHttpError(500, "REBUILD_INSERT_REPEATED_FAILED", "Falha ao inserir repetidos.", error);
      }
    }

    await writeAuditLog({
      action: "rebuild",
      table: "repetidos",
      actor,
      newData: {
        grupos: gruposPayload.length,
        itens: repetidosPayload.length
      },
      details: "Rebuild de repetidos e grupos_repetidos"
    });

    return apiOk(
      {
        grupos_repetidos: gruposPayload.length,
        registros_repetidos: repetidosPayload.length
      },
      { request_id: requestId }
    );
  });
}
