import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { code?: string } | null;
    const code = (body?.code ?? "ATUALIZAR_ANUNCIO").toString();

    const { data: anuncio, error: readError } = await supabase.from("anuncios").select("*").eq("id", id).maybeSingle();
    if (readError) throw new ApiHttpError(400, "ANUNCIO_READ_FAILED", "Falha ao carregar anuncio.", readError);
    if (!anuncio) throw new ApiHttpError(404, "NOT_FOUND", "Anuncio nao encontrado.");

    const { error: upsertError } = await supabase
      .from("anuncios_insight_verifications")
      .upsert(
        {
          anuncio_id: id,
          insight_code: code,
          verified_by: actor.userId,
          verified_at: new Date().toISOString()
        },
        { onConflict: "anuncio_id,insight_code" }
      );

    if (upsertError) {
      throw new ApiHttpError(400, "INSIGHT_VERIFY_FAILED", "Falha ao registrar verificacao de insight.", upsertError);
    }

    await writeAuditLog({
      action: "update",
      table: "anuncios_insight_verifications",
      pk: `${id}:${code}`,
      actor,
      newData: { anuncio_id: id, insight_code: code }
    });

    return apiOk({ verified: true, id, code }, { request_id: requestId });
  });
}
