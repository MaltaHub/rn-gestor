import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/api/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock })
}));

afterEach(() => {
  fromMock.mockReset();
});

function buildListQuery(payload: { data: unknown; error: unknown; count: number | null }) {
  // The route builds a thenable then conditionally chains .eq() onto it.
  // Mirror that: every method returns the same builder, and awaiting it
  // resolves to the payload via a `then` implementation.
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.range = () => builder;
  builder.eq = () => builder;
  builder.then = (resolve: (value: typeof payload) => unknown) => Promise.resolve(resolve(payload));
  const from = vi.fn(() => builder);
  return { from };
}

function buildLatestQuery(payload: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(payload);
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eqChain = (): Record<string, unknown> => {
    const builder: Record<string, unknown> = {};
    builder.eq = () => builder;
    builder.order = order;
    return builder;
  };
  const select = vi.fn(() => eqChain());
  return { from: vi.fn(() => ({ select })) };
}

function buildRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

async function readJson(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("GET /api/v1/price-contexts", () => {
  it("returns 403 when role is below GERENTE", async () => {
    const { GET } = await import("@/app/api/v1/price-contexts/route");
    const req = buildRequest("http://localhost/api/v1/price-contexts", {
      "x-user-role": "SECRETARIO",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(403);
    expect((body as { error?: { code?: string } }).error?.code).toBe("FORBIDDEN");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 PRICE_CONTEXT_INVALID_TARGET when table is off-list", async () => {
    const { GET } = await import("@/app/api/v1/price-contexts/route");
    const req = buildRequest("http://localhost/api/v1/price-contexts?table=usuarios_acesso", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("PRICE_CONTEXT_INVALID_TARGET");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 when filtering by column without a table", async () => {
    const { GET } = await import("@/app/api/v1/price-contexts/route");
    const req = buildRequest("http://localhost/api/v1/price-contexts?column=preco_original", {
      "x-user-role": "GERENTE",
      "x-user-id": "u-1"
    });

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("PRICE_CONTEXT_INVALID_TARGET");
  });

  it("returns 400 when column is off-list for the allowed table", async () => {
    const { GET } = await import("@/app/api/v1/price-contexts/route");
    const req = buildRequest(
      "http://localhost/api/v1/price-contexts?table=carros&column=valor_anuncio",
      { "x-user-role": "GERENTE", "x-user-id": "u-1" }
    );

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("PRICE_CONTEXT_INVALID_TARGET");
  });

  it("returns 200 with rows for a valid GERENTE request", async () => {
    const stub = buildListQuery({
      data: [
        {
          id: "ctx-1",
          table_name: "carros",
          row_id: "car-1",
          column_name: "preco_original",
          old_value: 1,
          new_value: 2,
          context: "ajuste",
          created_by: "u-1",
          created_at: "2026-05-08T00:00:00Z"
        }
      ],
      error: null,
      count: 1
    });
    fromMock.mockImplementation(stub.from);

    const { GET } = await import("@/app/api/v1/price-contexts/route");
    const req = buildRequest(
      "http://localhost/api/v1/price-contexts?table=carros&column=preco_original",
      { "x-user-role": "GERENTE", "x-user-id": "u-1" }
    );

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(200);
    const data = (body as { data?: { rows?: unknown[] } }).data;
    expect(Array.isArray(data?.rows)).toBe(true);
    expect(data?.rows).toHaveLength(1);
    expect(stub.from).toHaveBeenCalledWith("price_change_contexts");
  });
});

describe("GET /api/v1/price-contexts/latest", () => {
  it("returns 403 for VENDEDOR", async () => {
    const { GET } = await import("@/app/api/v1/price-contexts/latest/route");
    const req = buildRequest(
      "http://localhost/api/v1/price-contexts/latest?table=carros&row_id=r&column=preco_original",
      { "x-user-role": "VENDEDOR", "x-user-id": "u-1" }
    );

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(403);
    expect((body as { error?: { code?: string } }).error?.code).toBe("FORBIDDEN");
  });

  it("returns 400 PRICE_CONTEXT_INVALID_TARGET for unknown table", async () => {
    const { GET } = await import("@/app/api/v1/price-contexts/latest/route");
    const req = buildRequest(
      "http://localhost/api/v1/price-contexts/latest?table=usuarios_acesso&row_id=r&column=email",
      { "x-user-role": "GERENTE", "x-user-id": "u-1" }
    );

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(400);
    expect((body as { error?: { code?: string } }).error?.code).toBe("PRICE_CONTEXT_INVALID_TARGET");
  });

  it("returns 200 entry for a valid GERENTE request", async () => {
    const stub = buildLatestQuery({
      data: {
        id: "ctx-9",
        table_name: "anuncios",
        row_id: "an-1",
        column_name: "valor_anuncio",
        old_value: 1000,
        new_value: 1500,
        context: "promo",
        created_by: "u-1",
        created_at: "2026-05-08T00:00:00Z"
      },
      error: null
    });
    fromMock.mockImplementation(stub.from);

    const { GET } = await import("@/app/api/v1/price-contexts/latest/route");
    const req = buildRequest(
      "http://localhost/api/v1/price-contexts/latest?table=anuncios&row_id=an-1&column=valor_anuncio",
      { "x-user-role": "GERENTE", "x-user-id": "u-1" }
    );

    const { status, body } = await readJson(await GET(req));
    expect(status).toBe(200);
    const data = (body as { data?: { entry?: { column_name?: string } } }).data;
    expect(data?.entry?.column_name).toBe("valor_anuncio");
  });
});
