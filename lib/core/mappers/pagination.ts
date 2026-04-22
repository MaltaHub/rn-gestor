import type { PaginationWindow } from "@/lib/core/types/pagination";

export function toPaginationWindow(page: number, pageSize: number): PaginationWindow {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}
