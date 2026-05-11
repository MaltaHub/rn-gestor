import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/api/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock })
}));

afterEach(() => {
  fromMock.mockReset();
});

type AuditQueryPayload = {
  data: Array<Record<string, unknown>> | null;
  error: unknown;
  count: number | null;
};

function buildAuditQuery(payload: AuditQueryPayload) {
  // Mirror the supabase-js chainable builder: every method returns the same
  // builder; awaiting the builder resolves to the payload.
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.range = () => Promise.resolve(payload);
  builder.eq = () => builder;
  return { from: vi.fn(() => builder) };
}

function buildRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

async function readJson(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("GET /api/v1/auditoria", () => {
  it("returns 403 when role is below GERENTE", async () => {
    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=1&page_size=50", {
      "x-user-role": "SECRETARIO",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(403);
    expect((body as { error?: { code?: string } }).error?.code).toBe("FORBIDDEN");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_PAGINATION for page < 1", async () => {
    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=0&page_size=50", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("INVALID_PAGINATION");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_PAGINATION for negative page", async () => {
    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=-3&page_size=50", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("INVALID_PAGINATION");
  });

  it("returns 400 INVALID_PAGINATION when page_size exceeds the upper bound", async () => {
    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=1&page_size=999", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("INVALID_PAGINATION");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_PAGINATION when page_size is below 1", async () => {
    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=1&page_size=0", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("INVALID_PAGINATION");
  });

  it("returns 400 INVALID_PAGINATION for non-integer page_size", async () => {
    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=1&page_size=abc", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("INVALID_PAGINATION");
  });

  it("returns 200 with the paginated envelope for a valid GERENTE request", async () => {
    const stub = buildAuditQuery({
      data: [
        {
          id: "log-1",
          acao: "update_carro",
          autor: "Alice",
          autor_cargo: "GERENTE",
          autor_email: "alice@example.com",
          autor_usuario_id: "u-1",
          dados_anteriores: { preco: 1000 },
          dados_novos: { preco: 1200 },
          data_hora: "2026-05-10T12:00:00.000Z",
          detalhes: null,
          em_lote: false,
          lote_id: null,
          pk: "car-1",
          tabela: "carros"
        }
      ],
      error: null,
      count: 1
    });
    fromMock.mockImplementation(stub.from);

    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=1&page_size=50", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(200);

    const data = (body as { data?: Record<string, unknown> }).data;
    expect(data).toBeDefined();
    expect(Array.isArray(data?.items)).toBe(true);
    expect((data?.items as unknown[]).length).toBe(1);
    expect(data?.total).toBe(1);
    expect(data?.page).toBe(1);
    expect(data?.pageSize).toBe(50);
    expect(data?.hasMore).toBe(false);

    expect(stub.from).toHaveBeenCalledWith("log_alteracoes");
  });

  it("signals hasMore=true when total exceeds the current page window", async () => {
    const stub = buildAuditQuery({
      data: [
        { id: "log-1", acao: "x", autor: "a", tabela: "t", data_hora: "2026-05-10T00:00:00Z" }
      ],
      error: null,
      count: 250
    });
    fromMock.mockImplementation(stub.from);

    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=1&page_size=50", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(200);
    const data = (body as { data?: Record<string, unknown> }).data;
    expect(data?.total).toBe(250);
    expect(data?.hasMore).toBe(true);
  });

  it("accepts the camelCase pageSize alias for the page_size query param", async () => {
    const stub = buildAuditQuery({ data: [], error: null, count: 0 });
    fromMock.mockImplementation(stub.from);

    const { GET } = await import("@/app/api/v1/auditoria/route");
    const req = buildRequest("http://localhost/api/v1/auditoria?page=1&pageSize=75", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(200);
    const data = (body as { data?: Record<string, unknown> }).data;
    expect(data?.pageSize).toBe(75);
  });
});
