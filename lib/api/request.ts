import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export function getRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

export function parsePagination(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("page_size") ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}
