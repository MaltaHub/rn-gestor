import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { toPaginationWindow } from "@/lib/core/mappers";
import { clampPage, clampPageSize } from "@/lib/core/guards";

export function getRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

export function parsePagination(req: NextRequest) {
  const rawPageSize =
    req.nextUrl.searchParams.get("page_size") ??
    req.nextUrl.searchParams.get("pageSize") ??
    "20";
  const page = clampPage(Number(req.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = clampPageSize(Number(rawPageSize), { maximum: 100, fallback: 20 });

  return toPaginationWindow(page, pageSize);
}

export type ListPaginationOptions = {
  defaultPageSize?: number;
  maxPageSize?: number;
};

/**
 * Stricter pagination parser used by list endpoints that need to surface
 * 400 errors instead of silently clamping bad input. Accepts both
 * `page_size` and `pageSize` query keys.
 */
export function parseListPagination(req: NextRequest, options: ListPaginationOptions = {}) {
  const defaultPageSize = options.defaultPageSize ?? 50;
  const maxPageSize = options.maxPageSize ?? 200;

  const rawPage = req.nextUrl.searchParams.get("page");
  const rawPageSize =
    req.nextUrl.searchParams.get("page_size") ?? req.nextUrl.searchParams.get("pageSize");

  const page = rawPage == null || rawPage === "" ? 1 : Number(rawPage);
  const pageSize = rawPageSize == null || rawPageSize === "" ? defaultPageSize : Number(rawPageSize);

  if (!Number.isInteger(page) || page < 1) {
    throw new ApiHttpError(400, "INVALID_PAGINATION", "Parametro 'page' invalido: deve ser inteiro >= 1.", {
      page: rawPage
    });
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
    throw new ApiHttpError(
      400,
      "INVALID_PAGINATION",
      `Parametro 'page_size' invalido: deve ser inteiro entre 1 e ${maxPageSize}.`,
      { pageSize: rawPageSize, maxPageSize }
    );
  }

  return toPaginationWindow(page, pageSize);
}
