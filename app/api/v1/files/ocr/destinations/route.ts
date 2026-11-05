import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { getOcrCatalog } from "@/lib/domain/ocr/server-catalog";

/** GET /files/ocr/destinations — colunas que o OCR pode gravar (catalogo derivado do grid). So ADMINISTRADOR. */
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ requestId }) => {
    return apiOk({ tables: getOcrCatalog() }, { request_id: requestId });
  });
}
