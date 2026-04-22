import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { toPaginationWindow } from "@/lib/core/mappers";
import { clampPage, clampPageSize } from "@/lib/core/guards";

export function getRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

export function parsePagination(req: NextRequest) {
  const page = clampPage(Number(req.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = clampPageSize(Number(req.nextUrl.searchParams.get("page_size") ?? 20), { maximum: 100, fallback: 20 });

  return toPaginationWindow(page, pageSize);
}
