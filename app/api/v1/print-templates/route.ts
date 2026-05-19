import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import {
  createPrintTemplate,
  listPrintTemplates
} from "@/lib/domain/print-templates/service";
import { printTemplateCreateSchema } from "@/lib/domain/print-templates/schemas";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const sheetKey = req.nextUrl.searchParams.get("sheet");
    const rows = await listPrintTemplates({ supabase, actor, sheetKey });
    return apiOk(rows, { request_id: requestId });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = printTemplateCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de template invalido.", parsed.error);
    }

    const data = await createPrintTemplate({ supabase, actor, row: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}
