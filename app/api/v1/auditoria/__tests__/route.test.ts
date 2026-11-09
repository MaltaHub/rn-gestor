import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/api/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock })
}));

afterEach(() => {
  fromMock.mockReset();
});

type Payload = { data: Array<Record<string, unknown>> | null; error: unknown; count?: number | null };

/** Builder encadeável do supabase-js: cada filtro devolve o builder; `await` resolve o payload. */
function buildQuery(payloadByTable: Record<string, Payload>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "eq", "neq", "gte", "lte", "or", "in"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    }
    builder.then = (resolve: (value: Payload) => unknown) => Promise.resolve(payloadByTable[table] ?? { data: [], error: null }).then(resolve);
    return builder;
  });
  return { from, calls };
}

function request(query: string, role = "GERENTE") {
  return new NextRequest(`http://localhost/api/v1/auditoria${query}`, { headers: { "x-user-role": role, "x-user-id": "u-1" } });
}

async function readJson(res: Response) {
  return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown>; error?: { code?: string } } };
}

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  acao: "UPDATE",
  autor: "SISTEMA",
  autor_cargo: null,
  autor_email: null,
  autor_usuario_id: null,
  dados_anteriores: { estado_transferencia: "AGUARDANDO" },
  dados_novos: { estado_transferencia: "BRANCO", __veiculo: { carro_id: "c-1", placa: "TDV2E99" } },
  data_hora: "2026-11-09T13:48:47.7672+00:00",
  detalhes: "Automático: efeito da ação de Kaic Malta — Upload de 1 arquivo(s).",
  em_lote: false,
  lote_id: "req-1",
  pk: "c-1",
  tabela: "documentos"
};

describe("GET /api/v1/auditoria", () => {
  it("exige GERENTE", async () => {
    const { GET } = await import("@/app/api/v1/auditoria/route");
    const { status, body } = await readJson(await GET(request("", "SECRETARIO")));
    expect(status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("recusa tabela fora da auditoria, cursor e limite inválidos", async () => {
    const { GET } = await import("@/app/api/v1/auditoria/route");
    for (const query of ["?tabela=log_alteracoes", "?tabela=x;drop", "?acao=TRUNCATE", "?cursor=lixo", "?limite=500", "?de=09/11/2026"]) {
      const { status, body } = await readJson(await GET(request(query)));
      expect(status, query).toBe(400);
      expect(["INVALID_FILTER", "INVALID_CURSOR"]).toContain(body.error?.code);
    }
  });

  it("devolve só o que mudou, o veículo e SISTEMA nas alterações automáticas", async () => {
    const stub = buildQuery({ log_alteracoes: { data: [ROW], error: null, count: 1 } });
    fromMock.mockImplementation(stub.from);
    const { GET } = await import("@/app/api/v1/auditoria/route");

    const { status, body } = await readJson(await GET(request("?tabela=documentos&origem=sistema")));
    expect(status).toBe(200);
    const entries = body.data?.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      table: "documentos",
      tableLabel: "Documentos",
      placa: "TDV2E99",
      author: { name: "SISTEMA", system: true },
      changes: [{ field: "estado_transferencia", label: "Situação do CRLV", before: "AGUARDANDO", after: "BRANCO" }]
    });
    expect(body.data?.total).toBe(1);
    expect(body.data?.nextCursor).toBeNull();
    expect(stub.calls).toContainEqual({ table: "log_alteracoes", method: "eq", args: ["tabela", "documentos"] });
    expect(stub.calls).toContainEqual({ table: "log_alteracoes", method: "eq", args: ["autor", "SISTEMA"] });
  });

  it("pagina por cursor quando há mais linhas que o limite", async () => {
    const second = { ...ROW, id: "22222222-2222-4222-8222-222222222222", data_hora: "2026-11-09T13:00:00+00:00" };
    const stub = buildQuery({ log_alteracoes: { data: [ROW, second], error: null, count: 2 } });
    fromMock.mockImplementation(stub.from);
    const { GET } = await import("@/app/api/v1/auditoria/route");

    const first = await readJson(await GET(request("?limite=1")));
    expect(first.status).toBe(200);
    const cursor = first.body.data?.nextCursor as string;
    expect(typeof cursor).toBe("string");

    const next = await readJson(await GET(request(`?limite=1&cursor=${cursor}`)));
    expect(next.status).toBe(200);
    expect(stub.calls.some((call) => call.method === "or" && String(call.args[0]).includes(ROW.id))).toBe(true);
  });

  it("meta=1 traz tabelas auditadas, autores e a retenção", async () => {
    const stub = buildQuery({
      log_alteracoes: { data: [], error: null, count: 0 },
      usuarios_acesso: { data: [{ id: "u-1", nome: "Kaic Malta" }], error: null }
    });
    fromMock.mockImplementation(stub.from);
    const { GET } = await import("@/app/api/v1/auditoria/route");

    const { status, body } = await readJson(await GET(request("?meta=1")));
    expect(status).toBe(200);
    const meta = body.data?.meta as { tables: Array<{ key: string }>; authors: unknown[]; retention: unknown };
    expect(meta.tables.map((table) => table.key)).toContain("carros");
    expect(meta.tables.map((table) => table.key)).not.toContain("repetidos");
    expect(meta.authors).toEqual([{ id: "u-1", name: "Kaic Malta" }]);
    expect(meta.retention).toEqual({ days: 30, maxRowsPerTable: 5000 });
  });
});
