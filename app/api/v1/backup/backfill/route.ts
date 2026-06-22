import type { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

type ChunkResult = { total?: number; rows?: Array<Record<string, unknown>> } | null;
type Target = { url?: string | null; token?: string | null } | null;

// GET: plano (tabelas + totais) para a barra de progresso.
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ supabase, requestId }) => {
    const { data, error } = await supabase.rpc("backup_plan");
    if (error) {
      throw new ApiHttpError(500, "BACKUP_PLAN_FAILED", "Falha ao montar o plano de backup.", error);
    }
    return apiOk(data, { request_id: requestId });
  });
}

// POST {table, offset, limit}: le 1 lote e POSTa ao Apps Script; devolve progresso.
export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ supabase, requestId }) => {
    const body = (await req.json().catch(() => ({}))) as { table?: unknown; offset?: unknown; limit?: unknown };
    const table = String(body.table ?? "").trim();
    const offset = Math.max(Number(body.offset ?? 0) || 0, 0);
    const limit = Math.min(Math.max(Number(body.limit ?? 100) || 100, 1), 500);
    if (!table) {
      throw new ApiHttpError(400, "BACKUP_TABLE_REQUIRED", "Parametro `table` obrigatorio.");
    }

    const { data: chunkData, error: chunkErr } = await supabase.rpc("backup_chunk", {
      p_table: table,
      p_offset: offset,
      p_limit: limit
    });
    if (chunkErr) {
      throw new ApiHttpError(400, "BACKUP_CHUNK_FAILED", "Falha ao ler o lote.", chunkErr);
    }
    const chunk = chunkData as ChunkResult;
    const total = Number(chunk?.total ?? 0);
    const rows = Array.isArray(chunk?.rows) ? chunk!.rows : [];

    if (rows.length === 0) {
      return apiOk({ table, offset, sent: 0, applied: 0, total, done: true }, { request_id: requestId });
    }

    const { data: targetData, error: targetErr } = await supabase.rpc("backup_target");
    if (targetErr) {
      throw new ApiHttpError(500, "BACKUP_TARGET_FAILED", "Falha ao ler o alvo do Apps Script.", targetErr);
    }
    const target = targetData as Target;
    if (!target?.url || !target?.token) {
      throw new ApiHttpError(
        412,
        "BACKUP_TARGET_MISSING",
        "Apps Script nao configurado (url_appscript_supply/token_appscript_supply em internal.app_settings)."
      );
    }

    const payload = {
      token: target.token,
      source: "backfill-ui",
      ops: rows.map((row) => ({ table, op: "upsert", row }))
    };

    let applied = 0;
    try {
      const resp = await fetch(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const text = await resp.text();
      let parsed: { ok?: boolean; count?: number; error?: string } | null = null;
      try {
        parsed = JSON.parse(text) as { ok?: boolean; count?: number; error?: string };
      } catch {
        parsed = null;
      }
      if (!parsed?.ok) {
        throw new ApiHttpError(502, "BACKUP_APPSCRIPT_ERROR", "Apps Script rejeitou o lote.", {
          status: resp.status,
          response: text.slice(0, 500)
        });
      }
      applied = Number(parsed.count ?? rows.length);
    } catch (err) {
      if (err instanceof ApiHttpError) throw err;
      throw new ApiHttpError(502, "BACKUP_APPSCRIPT_UNREACHABLE", "Falha ao enviar o lote ao Apps Script.", String(err));
    }

    return apiOk(
      { table, offset, sent: rows.length, applied, total, done: offset + rows.length >= total },
      { request_id: requestId }
    );
  });
}
