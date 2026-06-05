import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { clampShareMinutes, createCarroShareToken } from "@/lib/domain/carros/share";

// POST /api/v1/carros/:id/compartilhar { expiresInMinutes } -> { token, url, expiresAt }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { expiresInMinutes?: unknown };
    const minutes = clampShareMinutes(body?.expiresInMinutes);

    const { token, expiresAt } = createCarroShareToken(id, minutes);
    const url = `${req.nextUrl.origin}/galeria/${token}`;

    return apiOk({ token, url, expiresAt }, { request_id: requestId });
  });
}
