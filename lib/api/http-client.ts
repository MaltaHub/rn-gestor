import type { ApiEnvelope, ApiErrorPayload } from "@/lib/core/types/api";

export type { ApiEnvelope, ApiErrorPayload } from "@/lib/core/types/api";

const DEFAULT_API_REQUEST_TIMEOUT_MS = 15_000;

export type ApiClientErrorOptions = {
  status?: number;
  code?: string;
  details?: unknown;
};

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options?: ApiClientErrorOptions) {
    super(message);
    this.name = "ApiClientError";
    this.status = options?.status ?? 500;
    this.code = options?.code;
    this.details = options?.details;
  }
}

export type ApiFetchOptions = {
  /** Total time before the request is aborted with `REQUEST_TIMEOUT`. Defaults to 15s. */
  timeoutMs?: number;
  /** Message used when the timeout fires. */
  timeoutMessage?: string;
};

/**
 * Wraps `fetch` with an `AbortController`-based timeout. If the caller passes
 * `init.signal`, the external signal still aborts the request, but only the
 * internal timeout produces a typed `ApiClientError("REQUEST_TIMEOUT")`; an
 * external abort is rethrown as-is so callers can detect their own cancellation.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ApiFetchOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_API_REQUEST_TIMEOUT_MS;
  const timeoutMessage = options?.timeoutMessage ?? "Tempo limite excedido ao comunicar com a API.";

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const externalSignal = init?.signal ?? undefined;
  const abortFromExternal = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && timedOut) {
      throw new ApiClientError(timeoutMessage, {
        status: 408,
        code: "REQUEST_TIMEOUT"
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

export type ParseEnvelopeOptions = {
  /** Fallback message used when the envelope error payload omits `message`. */
  fallbackErrorMessage?: string;
  /** Fallback message used when the response body is not valid JSON. */
  invalidJsonMessage?: string;
};

/**
 * Reads a `{ data, meta, error }` envelope and either returns `data` or throws
 * a typed `ApiClientError`. Treats non-JSON bodies and non-2xx responses as
 * errors so consumers always get structured failures.
 */
export async function parseEnvelope<T>(
  response: Response,
  options?: ParseEnvelopeOptions
): Promise<T> {
  const fallbackErrorMessage = options?.fallbackErrorMessage ?? "Falha na operacao da API.";
  const invalidJsonMessage =
    options?.invalidJsonMessage ??
    "Resposta invalida da API. Verifique se o servidor retornou erro HTML ou cache invalido.";

  const raw = await response.text();

  let json: ApiEnvelope<T>;
  try {
    json = JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    throw new ApiClientError(invalidJsonMessage, {
      status: response.status,
      code: "API_INVALID_JSON",
      details: raw.slice(0, 500)
    });
  }

  const errorPayload: ApiErrorPayload | undefined = json?.error;
  if (!response.ok || errorPayload) {
    const message = errorPayload?.message;
    throw new ApiClientError(message && message.length > 0 ? message : fallbackErrorMessage, {
      status: response.status,
      code: errorPayload?.code,
      details: errorPayload?.details
    });
  }

  return json.data;
}
