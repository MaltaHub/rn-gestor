import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { listVehicleDocuments } from "@/lib/domain/carros/media";

// GET /api/v1/carros/:id/documentos -> { placa, files } (somente leitura: preview/download).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { id } = await params;
    const data = await listVehicleDocuments(supabase, id);
    return apiOk(data, { request_id: requestId });
  });
}
