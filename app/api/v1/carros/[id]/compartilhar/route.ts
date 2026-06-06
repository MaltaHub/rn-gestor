import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { createCarroShareToken } from "@/lib/domain/carros/share";

// GET /api/v1/carros/:id/compartilhar -> { token, url } (link fixo de fotos do veiculo).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId }) => {
    const { id } = await params;
    const token = createCarroShareToken(id);
    const url = `${req.nextUrl.origin}/galeria/${token}`;
    return apiOk({ token, url }, { request_id: requestId });
  });
}
