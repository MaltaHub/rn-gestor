import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { listVehiclePhotos } from "@/lib/domain/carros/media";

// GET /api/v1/carros/:id/fotos -> { cover, photos } (preview assinado, ordenado).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { id } = await params;
    const data = await listVehiclePhotos(supabase, id);
    return apiOk(data, { request_id: requestId });
  });
}
