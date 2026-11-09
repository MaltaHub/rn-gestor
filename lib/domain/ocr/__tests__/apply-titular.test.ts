import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/audit", () => ({ writeAuditLog: vi.fn(async () => undefined), toAuditJson: (value: unknown) => value }));

import type { ActorContext } from "@/lib/api/auth";
import { applyOcrValues } from "@/lib/domain/ocr/service";

type Row = Record<string, unknown>;
type Call = { table: string; op: "select" | "update" | "insert"; payload?: Row; filters: Row };

/** Supabase de mentira: registra cada operação para provar o que o OCR grava. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  function from(table: string) {
    const state: { op: Call["op"]; payload?: Row; filters: Row } = { op: "select", filters: {} };
    const run = (single: boolean) => {
      calls.push({ table, op: state.op, payload: state.payload, filters: { ...state.filters } });
      const rows = (tables[table] ?? []).filter((row) => Object.entries(state.filters).every(([key, value]) => row[key] === value));
      if (state.op === "update") return { data: { ...rows[0], ...state.payload }, error: null };
      return { data: single ? rows[0] ?? null : rows, error: null };
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters[column] = value;
        return builder;
      },
      limit: () => builder,
      update: (payload: Row) => {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      insert: (payload: Row) => {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      maybeSingle: async () => run(true),
      single: async () => run(true),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(run(false)).then(resolve, reject)
    };
    return builder;
  }
  return { client: { from } as unknown as Parameters<typeof applyOcrValues>[0], calls };
}

const actor: ActorContext = { authUserId: "u", role: "ADMINISTRADOR", status: "APROVADO", userId: "u", userName: "Teste", userEmail: null };
const CARRO = "11111111-1111-4111-8111-111111111111";

function db() {
  return fakeSupabase({
    documentos: [{ carro_id: CARRO, responsavel_virado_id: null }],
    responsaveis_virado: [{ id: "r-1", nome: "ROBERTOAUTO", cpf_cnpj: "09625553000104" }]
  });
}

describe("OCR do titular do CRLV: só liga, nunca cria nem altera o cadastro", () => {
  it("CPF/CNPJ achado: liga em documentos e ignora o nome lido", async () => {
    const { client, calls } = db();
    await applyOcrValues(client, actor, {
      carroId: CARRO,
      fileId: null,
      templateId: null,
      markReady: false,
      values: { "responsaveis_virado.cpf_cnpj": "09.625.553/0001-04", "responsaveis_virado.nome": "NOME LIDO DIFERENTE" }
    });
    const writes = calls.filter((call) => call.op !== "select");
    expect(writes).toEqual([{ table: "documentos", op: "update", payload: { responsavel_virado_id: "r-1" }, filters: { carro_id: CARRO } }]);
    expect(calls.some((call) => call.table === "responsaveis_virado" && call.op !== "select")).toBe(false);
  });

  it("só o nome exato também liga", async () => {
    const { client, calls } = db();
    await applyOcrValues(client, actor, {
      carroId: CARRO,
      fileId: null,
      templateId: null,
      markReady: false,
      values: { "responsaveis_virado.nome": "robertoauto" }
    });
    expect(calls.filter((call) => call.op !== "select")).toEqual([
      { table: "documentos", op: "update", payload: { responsavel_virado_id: "r-1" }, filters: { carro_id: CARRO } }
    ]);
  });

  it("não cadastrado: nada é gravado (o cliente abre o cadastro)", async () => {
    const { client, calls } = db();
    await expect(
      applyOcrValues(client, actor, {
        carroId: CARRO,
        fileId: null,
        templateId: null,
        markReady: false,
        values: { "responsaveis_virado.cpf_cnpj": "529.982.247-25", "responsaveis_virado.nome": "NOVO" }
      })
    ).rejects.toMatchObject({ code: "OCR_TITULAR_NAO_CADASTRADO" });
    expect(calls.filter((call) => call.op !== "select")).toEqual([]);
  });
});
