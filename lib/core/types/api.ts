import type { ApiSuccessMeta } from "@/lib/core/types/pagination";

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiEnvelope<T> = {
  data: T;
  meta?: ApiSuccessMeta;
  error?: ApiErrorPayload;
};
