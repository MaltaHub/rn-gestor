import { NextResponse } from "next/server";
import type { ApiSuccessMeta } from "@/lib/core/types";

export function apiOk<T>(data: T, meta: ApiSuccessMeta) {
  return NextResponse.json({ data, meta });
}

export function apiError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details
      },
      request_id: requestId
    },
    { status }
  );
}
