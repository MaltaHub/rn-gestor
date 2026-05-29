import { describe, expect, it, vi } from "vitest";
import {
  listVariablesForUser,
  upsertVariable,
  upsertVariableBatch,
  deleteVariable
} from "@/lib/domain/editor-user-variables/service";
import { ApiHttpError } from "@/lib/api/errors";
import type { ActorContext } from "@/lib/api/auth";

// ---------- helpers ----------

function makeActor(authUserId: string | null = "user-abc"): ActorContext {
  return { authUserId } as ActorContext;
}

/** Monta um SupabaseClient fake com os metodos que o servico usa. */
function makeSupabase(overrides: Record<string, unknown> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    delete: vi.fn().mockReturnThis(),
    ...overrides
  };
  return {
    from: vi.fn().mockReturnValue(defaultChain),
    _chain: defaultChain
  };
}

// ---------- listVariablesForUser ----------

describe("listVariablesForUser", () => {
  it("retorna [] quando data e null (tabela vazia)", async () => {
    const sb = makeSupabase();
    sb._chain.order = vi.fn().mockResolvedValue({ data: null, error: null });
    const result = await listVariablesForUser({ supabase: sb as never, actor: makeActor() });
    expect(result).toEqual([]);
  });

  it("retorna as rows quando ha dados", async () => {
    const rows = [
      { user_id: "user-abc", name: "minha_var", value: "hello", type: "value", created_at: "", updated_at: "" }
    ];
    const sb = makeSupabase();
    sb._chain.order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const result = await listVariablesForUser({ supabase: sb as never, actor: makeActor() });
    expect(result).toEqual(rows);
  });

  it("lanca 401 quando actor nao tem authUserId", async () => {
    const sb = makeSupabase();
    await expect(
      listVariablesForUser({ supabase: sb as never, actor: makeActor(null) })
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("lanca 500 EDITOR_USER_VARIABLES_LIST_FAILED em erro do banco", async () => {
    const sb = makeSupabase();
    sb._chain.order = vi.fn().mockResolvedValue({ data: null, error: new Error("db fail") });
    await expect(
      listVariablesForUser({ supabase: sb as never, actor: makeActor() })
    ).rejects.toMatchObject({ status: 500, code: "EDITOR_USER_VARIABLES_LIST_FAILED" });
  });
});

// ---------- upsertVariable ----------

describe("upsertVariable", () => {
  it("insere variavel e retorna row", async () => {
    const row = { user_id: "user-abc", name: "counter", value: 0, type: "value", created_at: "", updated_at: "" };
    const sb = makeSupabase();
    sb._chain.single = vi.fn().mockResolvedValue({ data: row, error: null });
    const result = await upsertVariable({
      supabase: sb as never,
      actor: makeActor(),
      row: { name: "counter", value: 0 }
    });
    expect(result).toEqual(row);
  });

  it("usa 'value' como type padrao quando nao fornecido", async () => {
    const sb = makeSupabase();
    const upsertMock = vi.fn().mockReturnValue(sb._chain);
    sb._chain.upsert = upsertMock;
    sb._chain.single = vi.fn().mockResolvedValue({ data: { name: "n" }, error: null });
    await upsertVariable({ supabase: sb as never, actor: makeActor(), row: { name: "n", value: "x" } });
    const upsertedRows = upsertMock.mock.calls[0][0];
    expect(upsertedRows.type).toBe("value");
  });

  it("usa type fornecido quando presente", async () => {
    const sb = makeSupabase();
    const upsertMock = vi.fn().mockReturnValue(sb._chain);
    sb._chain.upsert = upsertMock;
    sb._chain.single = vi.fn().mockResolvedValue({ data: { name: "n" }, error: null });
    await upsertVariable({ supabase: sb as never, actor: makeActor(), row: { name: "n", value: "x", type: "custom" } });
    const upsertedRows = upsertMock.mock.calls[0][0];
    expect(upsertedRows.type).toBe("custom");
  });

  it("lanca 400 INVALID_VALUE para nome com prefixo system.", async () => {
    const sb = makeSupabase();
    await expect(
      upsertVariable({ supabase: sb as never, actor: makeActor(), row: { name: "system.clock", value: "x" } })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_VALUE" });
  });

  it("lanca 400 INVALID_VALUE para System. (case-insensitive)", async () => {
    const sb = makeSupabase();
    await expect(
      upsertVariable({ supabase: sb as never, actor: makeActor(), row: { name: "System.foo", value: "x" } })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_VALUE" });
  });

  it("lanca 401 sem authUserId", async () => {
    const sb = makeSupabase();
    await expect(
      upsertVariable({ supabase: sb as never, actor: makeActor(null), row: { name: "n", value: "x" } })
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("lanca 400 EDITOR_USER_VARIABLE_UPSERT_FAILED em erro do banco", async () => {
    const sb = makeSupabase();
    sb._chain.single = vi.fn().mockResolvedValue({ data: null, error: new Error("unique violation") });
    await expect(
      upsertVariable({ supabase: sb as never, actor: makeActor(), row: { name: "n", value: "x" } })
    ).rejects.toMatchObject({ status: 400, code: "EDITOR_USER_VARIABLE_UPSERT_FAILED" });
  });
});

// ---------- upsertVariableBatch ----------

describe("upsertVariableBatch", () => {
  it("insere lote e retorna rows", async () => {
    const rows = [
      { name: "a", value: 1 },
      { name: "b", value: 2 }
    ];
    const sb = makeSupabase();
    sb._chain.select = vi.fn().mockResolvedValue({ data: rows, error: null });
    const result = await upsertVariableBatch({
      supabase: sb as never,
      actor: makeActor(),
      payload: { items: [{ name: "a", value: 1 }, { name: "b", value: 2 }] }
    });
    expect(result).toEqual(rows);
  });

  it("lanca 400 INVALID_VALUE se qualquer item usa prefixo system.", async () => {
    const sb = makeSupabase();
    await expect(
      upsertVariableBatch({
        supabase: sb as never,
        actor: makeActor(),
        payload: { items: [{ name: "ok", value: 1 }, { name: "system.clock", value: "x" }] }
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_VALUE" });
    // Nenhuma query deve ter sido feita (rejeicao antes do upsert)
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("rejeita no primeiro nome system. sem processar itens anteriores", async () => {
    const sb = makeSupabase();
    await expect(
      upsertVariableBatch({
        supabase: sb as never,
        actor: makeActor(),
        payload: { items: [{ name: "system.first", value: 0 }, { name: "ok", value: 1 }] }
      })
    ).rejects.toBeInstanceOf(ApiHttpError);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("lanca 401 sem authUserId", async () => {
    const sb = makeSupabase();
    await expect(
      upsertVariableBatch({
        supabase: sb as never,
        actor: makeActor(null),
        payload: { items: [{ name: "n", value: 0 }] }
      })
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("lanca 400 EDITOR_USER_VARIABLES_BATCH_UPSERT_FAILED em erro do banco", async () => {
    const sb = makeSupabase();
    sb._chain.select = vi.fn().mockResolvedValue({ data: null, error: new Error("db fail") });
    await expect(
      upsertVariableBatch({
        supabase: sb as never,
        actor: makeActor(),
        payload: { items: [{ name: "n", value: 0 }] }
      })
    ).rejects.toMatchObject({ status: 400, code: "EDITOR_USER_VARIABLES_BATCH_UPSERT_FAILED" });
  });

  it("retorna [] quando data e null (supabase retorna null em sucesso vazio)", async () => {
    const sb = makeSupabase();
    sb._chain.select = vi.fn().mockResolvedValue({ data: null, error: null });
    const result = await upsertVariableBatch({
      supabase: sb as never,
      actor: makeActor(),
      payload: { items: [{ name: "n", value: 0 }] }
    });
    expect(result).toEqual([]);
  });
});

// ---------- deleteVariable ----------

describe("deleteVariable", () => {
  it("deleta variavel com sucesso (count=1)", async () => {
    const sb = makeSupabase();
    sb._chain.eq = vi.fn().mockReturnThis();
    // Segundo .eq() retorna a promise final
    let callCount = 0;
    sb._chain.eq = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount >= 2) return Promise.resolve({ error: null, count: 1 });
      return sb._chain;
    });
    await expect(
      deleteVariable({ supabase: sb as never, actor: makeActor(), name: "minha_var" })
    ).resolves.toBeUndefined();
  });

  it("lanca 404 NOT_FOUND quando count=0 (variavel nao existe)", async () => {
    const sb = makeSupabase();
    let callCount = 0;
    sb._chain.eq = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount >= 2) return Promise.resolve({ error: null, count: 0 });
      return sb._chain;
    });
    await expect(
      deleteVariable({ supabase: sb as never, actor: makeActor(), name: "nao_existe" })
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("lanca 400 INVALID_VALUE para nome com prefixo system.", async () => {
    const sb = makeSupabase();
    await expect(
      deleteVariable({ supabase: sb as never, actor: makeActor(), name: "system.clock" })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_VALUE" });
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("lanca 401 sem authUserId", async () => {
    const sb = makeSupabase();
    await expect(
      deleteVariable({ supabase: sb as never, actor: makeActor(null), name: "n" })
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("lanca 400 EDITOR_USER_VARIABLE_DELETE_FAILED em erro do banco", async () => {
    const sb = makeSupabase();
    let callCount = 0;
    sb._chain.eq = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount >= 2) return Promise.resolve({ error: new Error("db fail"), count: null });
      return sb._chain;
    });
    await expect(
      deleteVariable({ supabase: sb as never, actor: makeActor(), name: "n" })
    ).rejects.toMatchObject({ status: 400, code: "EDITOR_USER_VARIABLE_DELETE_FAILED" });
  });
});
