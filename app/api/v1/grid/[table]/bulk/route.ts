import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { bulkUpsertGridRows } from "@/lib/api/grid/bulk";

// POST /api/v1/grid/:table/bulk -> upsert em lote (escritor avancado).
// Body: { rows: [...], matchColumn: string|null, apply: boolean }
export async function POST(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { table } = await params;
    const payload = await bulkUpsertGridRows({ req, table, actor, supabase });
    return apiOk(payload, { request_id: requestId });
  });
}
