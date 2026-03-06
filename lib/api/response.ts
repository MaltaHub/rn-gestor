import { NextResponse } from "next/server";

type SuccessMeta = {
  request_id: string;
  page?: number;
  page_size?: number;
  total?: number;
};

export function apiOk<T>(data: T, meta: SuccessMeta) {
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
