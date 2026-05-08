import { NextResponse } from "next/server";
import type { ApiSuccessMeta } from "@/lib/core/types";

export function apiOk<T>(data: T, meta: ApiSuccessMeta) {
  return NextResponse.json({ data, meta });
}

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id: string;
};

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

export function apiError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  const errorPayload: ApiErrorBody["error"] = { code, message };

  if (details !== undefined && !isProductionEnv()) {
    errorPayload.details = details;
  }

  const body: ApiErrorBody = {
    error: errorPayload,
    request_id: requestId
  };

  return NextResponse.json(body, { status });
}
