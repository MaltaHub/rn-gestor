import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiFetch, parseEnvelope } from "@/lib/api/http-client";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

function buildJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
}

describe("apiFetch", () => {
  it("throws REQUEST_TIMEOUT after the configured timeout fires", async () => {
    globalThis.fetch = vi.fn((_input, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const promise = apiFetch("/api/v1/sample", {}, { timeoutMs: 50 });
    const expectation = expect(promise).rejects.toBeInstanceOf(ApiClientError);

    await vi.advanceTimersByTimeAsync(60);
    await expectation;

    await promise.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApiClientError);
      const err = error as ApiClientError;
      expect(err.status).toBe(408);
      expect(err.code).toBe("REQUEST_TIMEOUT");
    });
  });

  it("rethrows external aborts without converting them to REQUEST_TIMEOUT", async () => {
    globalThis.fetch = vi.fn((_input, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    const promise = apiFetch("/api/v1/sample", { signal: controller.signal }, { timeoutMs: 5_000 });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns the underlying response when the request completes in time", async () => {
    const response = buildJsonResponse({ data: { ok: true } });
    globalThis.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await apiFetch("/api/v1/sample");
    expect(result).toBe(response);
  });
});

describe("parseEnvelope", () => {
  it("returns data when the envelope is successful", async () => {
    const response = buildJsonResponse({ data: { id: "abc" }, meta: { page: 1 } });
    const data = await parseEnvelope<{ id: string }>(response);
    expect(data).toEqual({ id: "abc" });
  });

  it("preserves meta-shaped envelopes by ignoring meta on success", async () => {
    const response = buildJsonResponse({
      data: { rows: [1, 2, 3] },
      meta: { page: 2, pageSize: 50, total: 120, totalPages: 3 }
    });
    const data = await parseEnvelope<{ rows: number[] }>(response);
    expect(data.rows).toEqual([1, 2, 3]);
  });

  it("throws ApiClientError with code/message/details when error envelope is present", async () => {
    const response = buildJsonResponse(
      {
        data: null,
        error: { code: "VALIDATION_FAILED", message: "Campo invalido", details: { field: "nome" } }
      },
      { status: 400 }
    );

    await expect(parseEnvelope(response)).rejects.toMatchObject({
      name: "ApiClientError",
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Campo invalido",
      details: { field: "nome" }
    });
  });

  it("uses fallback message when error.message is missing", async () => {
    const response = buildJsonResponse(
      { data: null, error: { code: "INTERNAL", message: "" } },
      { status: 500 }
    );

    await expect(
      parseEnvelope(response, { fallbackErrorMessage: "Erro generico." })
    ).rejects.toMatchObject({
      message: "Erro generico.",
      status: 500
    });
  });

  it("throws API_INVALID_JSON when the body is not JSON", async () => {
    const response = new Response("<html>500</html>", {
      status: 502,
      headers: { "content-type": "text/html" }
    });

    await expect(parseEnvelope(response)).rejects.toMatchObject({
      name: "ApiClientError",
      code: "API_INVALID_JSON",
      status: 502
    });
  });

  it("treats non-2xx JSON without an error block as failure", async () => {
    const response = buildJsonResponse({ data: null }, { status: 503 });
    await expect(parseEnvelope(response)).rejects.toMatchObject({
      name: "ApiClientError",
      status: 503
    });
  });
});
