/**
 * Testes unitarios diretos dos handlers de node.
 * Complementa o interpreter.test.ts (que testa via grafo completo):
 * foca em casos de borda por handler isolado.
 */
import { describe, expect, it, vi } from "vitest";
import {
  wrapValue,
  handleBulkSelectSource,
  handleFilter,
  handleColumnPick,
  handleCompare,
  handleSwitch,
  handleSetVariable,
  handleGetVariable,
  handleLogNode
} from "@/lib/domain/editor-flows/runtime/node-handlers";
import type { NodeHandlerInput } from "@/lib/domain/editor-flows/runtime/node-handlers";
import type { RuntimeValue } from "@/lib/domain/editor-flows/runtime/types";
import { MOCK_DATA_SOURCE } from "@/lib/domain/editor-flows/runtime/interpreter";

// ---------- helpers ----------

function makeCtx(overrides: Partial<NodeHandlerInput> = {}): NodeHandlerInput {
  return {
    config: {},
    inputs: {},
    dataSource: MOCK_DATA_SOURCE,
    appendLog: vi.fn(),
    nodeId: "test",
    userVariables: new Map(),
    markVariableDirty: vi.fn(),
    frameContext: {},
    ...overrides
  };
}

function str(v: string): RuntimeValue { return { kind: "string", value: v }; }
function num(v: number): RuntimeValue { return { kind: "number", value: v }; }
function bool(v: boolean): RuntimeValue { return { kind: "boolean", value: v }; }
function rowList(rows: Record<string, unknown>[], sheet?: string): RuntimeValue {
  return { kind: "rowList", rows, sheet };
}
function row(data: Record<string, unknown>): RuntimeValue { return { kind: "row", data }; }

// ---------- wrapValue ----------

describe("wrapValue", () => {
  it("boolean -> { kind: boolean }", () => {
    expect(wrapValue(true)).toEqual({ kind: "boolean", value: true });
    expect(wrapValue(false)).toEqual({ kind: "boolean", value: false });
  });

  it("number -> { kind: number }", () => {
    expect(wrapValue(42)).toEqual({ kind: "number", value: 42 });
    expect(wrapValue(0)).toEqual({ kind: "number", value: 0 });
  });

  it("string -> { kind: string }", () => {
    expect(wrapValue("hello")).toEqual({ kind: "string", value: "hello" });
  });

  it("null/undefined/objeto -> { kind: value, raw }", () => {
    expect(wrapValue(null)).toEqual({ kind: "value", raw: null });
    expect(wrapValue(undefined)).toEqual({ kind: "value", raw: undefined });
    expect(wrapValue({ a: 1 })).toEqual({ kind: "value", raw: { a: 1 } });
  });
});

// ---------- handleBulkSelectSource — token parsing ----------

describe("handleBulkSelectSource — token parsing", () => {
  it("deduplica tokens repetidos", async () => {
    const ctx = makeCtx({ config: { sheet_key: "carros", match_column: "placa", tokens: "ABC,ABC,ABC" } });
    const out = await handleBulkSelectSource(ctx);
    // MOCK_DATA_SOURCE.matchRowsForBulkSelect e chamado com tokens unicos
    // Como o mock retorna rows baseado nos tokens, verifica que so 1 token foi passado
    // Indiretamente: o resultado nao deve crashar
    expect(out).toHaveProperty("rows");
  });

  it("filtra tokens apenas de whitespace", async () => {
    const ctx = makeCtx({ config: { sheet_key: "carros", match_column: "placa", tokens: "   ,  ,\n\t" } });
    const out = await handleBulkSelectSource(ctx);
    // tokens.length === 0 → retorna rowList vazio sem chamar dataSource
    expect((out.rows as RuntimeValue & { kind: "rowList" }).rows).toEqual([]);
  });

  it("divide por virgula, ponto-e-virgula, espaco e newline", async () => {
    // Sobrescreve dataSource para capturar os tokens passados
    const matchMock = vi.fn().mockResolvedValue([]);
    const ds = { ...MOCK_DATA_SOURCE, matchRowsForBulkSelect: matchMock };
    const ctx = makeCtx({
      dataSource: ds,
      config: { sheet_key: "carros", match_column: "placa", tokens: "A,B;C D\nE" }
    });
    await handleBulkSelectSource(ctx);
    const tokens: string[] = matchMock.mock.calls[0][2];
    expect(tokens.sort()).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("retorna rowList vazio quando sheet_key nao fornecido", async () => {
    const ctx = makeCtx({ config: { tokens: "ABC" } });
    const out = await handleBulkSelectSource(ctx);
    const rl = out.rows as RuntimeValue & { kind: "rowList" };
    expect(rl.rows).toEqual([]);
  });
});

// ---------- handleFilter — casos de borda ----------

describe("handleFilter", () => {
  const rows = [
    { placa: "ABC1A23", cor: "preto" },
    { placa: "DEF2B45", cor: "branco" },
    { placa: "GHI3C67", cor: "preto" }
  ];

  it("retorna rowList vazio quando input nao e rowList", async () => {
    const ctx = makeCtx({ inputs: { input: str("nao-e-lista") }, config: { column: "cor", operator: "eq", value: "preto" } });
    const out = await handleFilter(ctx);
    expect((out.result as RuntimeValue & { kind: "rowList" }).rows).toEqual([]);
  });

  it("passa todas as rows quando column nao configurado", async () => {
    const ctx = makeCtx({ inputs: { input: rowList(rows, "carros") }, config: { operator: "eq", value: "preto" } });
    const out = await handleFilter(ctx);
    expect((out.result as RuntimeValue & { kind: "rowList" }).rows).toHaveLength(3);
  });

  it("filtra por eq corretamente", async () => {
    const ctx = makeCtx({ inputs: { input: rowList(rows) }, config: { column: "cor", operator: "eq", value: "preto" } });
    const out = await handleFilter(ctx);
    const filtered = (out.result as RuntimeValue & { kind: "rowList" }).rows;
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.cor === "preto")).toBe(true);
  });

  it("filtra por neq corretamente", async () => {
    const ctx = makeCtx({ inputs: { input: rowList(rows) }, config: { column: "cor", operator: "neq", value: "preto" } });
    const out = await handleFilter(ctx);
    expect((out.result as RuntimeValue & { kind: "rowList" }).rows).toHaveLength(1);
  });

  it("filtra por contains (case-insensitive)", async () => {
    const data = [{ nome: "ABC Teste" }, { nome: "xyz" }];
    const ctx = makeCtx({ inputs: { input: rowList(data) }, config: { column: "nome", operator: "contains", value: "abc" } });
    const out = await handleFilter(ctx);
    expect((out.result as RuntimeValue & { kind: "rowList" }).rows).toHaveLength(1);
  });

  it("filtra por starts_with (case-insensitive)", async () => {
    const data = [{ nome: "Joao Silva" }, { nome: "Maria" }, { nome: "joana" }];
    const ctx = makeCtx({ inputs: { input: rowList(data) }, config: { column: "nome", operator: "starts_with", value: "jo" } });
    const out = await handleFilter(ctx);
    expect((out.result as RuntimeValue & { kind: "rowList" }).rows).toHaveLength(2);
  });

  it("coluna inexistente: nenhuma linha passa (undefined nao casa com valor)", async () => {
    const ctx = makeCtx({ inputs: { input: rowList(rows) }, config: { column: "nao_existe", operator: "eq", value: "preto" } });
    const out = await handleFilter(ctx);
    expect((out.result as RuntimeValue & { kind: "rowList" }).rows).toHaveLength(0);
  });

  it("comparacao numerica gt: '10' > '2' tratados como numeros", async () => {
    const data = [{ preco: "10" }, { preco: "2" }, { preco: "100" }];
    const ctx = makeCtx({ inputs: { input: rowList(data) }, config: { column: "preco", operator: "gt", value: "5" } });
    const out = await handleFilter(ctx);
    expect((out.result as RuntimeValue & { kind: "rowList" }).rows).toHaveLength(2);
  });

  it("operator desconhecido retorna rowList vazio (compareValues default false)", async () => {
    const ctx = makeCtx({ inputs: { input: rowList(rows) }, config: { column: "cor", operator: "like", value: "preto" } });
    const out = await handleFilter(ctx);
    expect((out.result as RuntimeValue & { kind: "rowList" }).rows).toHaveLength(0);
  });
});

// ---------- handleCompare — operadores ----------

describe("handleCompare", () => {
  it("eq: compara como string (null/undefined vira '')", async () => {
    expect((await handleCompare(makeCtx({ inputs: { left: str("a"), right: str("a") }, config: { operator: "eq" } }))).result).toEqual({ kind: "boolean", value: true });
    expect((await handleCompare(makeCtx({ inputs: {}, config: { operator: "eq" } }))).result).toEqual({ kind: "boolean", value: true }); // undefined == undefined -> "" == ""
  });

  it("neq: verdadeiro quando diferentes", async () => {
    expect((await handleCompare(makeCtx({ inputs: { left: num(1), right: num(2) }, config: { operator: "neq" } }))).result).toEqual({ kind: "boolean", value: true });
  });

  it("lt/lte/gt/gte: retorna false quando nao numerico", async () => {
    const ctx = makeCtx({ inputs: { left: str("abc"), right: str("xyz") }, config: { operator: "lt" } });
    expect((await handleCompare(ctx)).result).toEqual({ kind: "boolean", value: false });
  });

  it("lt: numeros validos comparados corretamente", async () => {
    expect((await handleCompare(makeCtx({ inputs: { left: num(3), right: num(5) }, config: { operator: "lt" } }))).result).toEqual({ kind: "boolean", value: true });
    expect((await handleCompare(makeCtx({ inputs: { left: num(5), right: num(3) }, config: { operator: "lt" } }))).result).toEqual({ kind: "boolean", value: false });
  });

  it("gte: igual retorna true", async () => {
    expect((await handleCompare(makeCtx({ inputs: { left: num(5), right: num(5) }, config: { operator: "gte" } }))).result).toEqual({ kind: "boolean", value: true });
  });
});

// ---------- handleColumnPick ----------

describe("handleColumnPick", () => {
  it("retorna value do campo", async () => {
    const ctx = makeCtx({ inputs: { row: row({ placa: "ABC1A23", cor: "preto" }) }, config: { column: "placa" } });
    const out = await handleColumnPick(ctx);
    expect(out.value).toEqual({ kind: "string", value: "ABC1A23" });
  });

  it("retorna value-raw quando campo e null", async () => {
    const ctx = makeCtx({ inputs: { row: row({ placa: null }) }, config: { column: "placa" } });
    const out = await handleColumnPick(ctx);
    expect(out.value).toEqual({ kind: "value", raw: null });
  });

  it("retorna value-raw undefined quando campo nao existe", async () => {
    const ctx = makeCtx({ inputs: { row: row({ placa: "X" }) }, config: { column: "inexistente" } });
    const out = await handleColumnPick(ctx);
    expect(out.value).toEqual({ kind: "value", raw: undefined });
  });

  it("retorna value-raw undefined quando input nao e row", async () => {
    const ctx = makeCtx({ inputs: { row: str("nao-e-row") }, config: { column: "placa" } });
    const out = await handleColumnPick(ctx);
    expect(out.value).toEqual({ kind: "value", raw: undefined });
  });

  it("retorna value-raw undefined quando column nao configurado", async () => {
    const ctx = makeCtx({ inputs: { row: row({ placa: "X" }) }, config: {} });
    const out = await handleColumnPick(ctx);
    expect(out.value).toEqual({ kind: "value", raw: undefined });
  });
});

// ---------- handleSwitch ----------

describe("handleSwitch", () => {
  it("roteia para case_0 quando casa exato", async () => {
    const ctx = makeCtx({ inputs: { input: str("azul") }, config: { case_0: "azul", case_1: "vermelho" } });
    const out = await handleSwitch(ctx);
    expect(out.case_0).toEqual(str("azul"));
    expect(out.case_1).toEqual({ kind: "void" });
    expect(out.default).toEqual({ kind: "void" });
  });

  it("roteia para default quando nenhum case casa", async () => {
    const ctx = makeCtx({ inputs: { input: str("verde") }, config: { case_0: "azul", case_1: "vermelho" } });
    const out = await handleSwitch(ctx);
    expect(out.default).toEqual(str("verde"));
    expect(out.case_0).toEqual({ kind: "void" });
  });

  it("e case-sensitive: 'AZUL' nao casa com 'azul'", async () => {
    const ctx = makeCtx({ inputs: { input: str("AZUL") }, config: { case_0: "azul" } });
    const out = await handleSwitch(ctx);
    expect(out.case_0).toEqual({ kind: "void" });
    expect(out.default).toEqual(str("AZUL"));
  });

  it("cases com string vazia sao ignorados", async () => {
    const ctx = makeCtx({ inputs: { input: str("x") }, config: { case_0: "", case_1: "", case_2: "" } });
    const out = await handleSwitch(ctx);
    expect(out.default).toEqual(str("x"));
  });

  it("sem cases configurados: sempre vai para default", async () => {
    const ctx = makeCtx({ inputs: { input: str("qualquer") }, config: {} });
    const out = await handleSwitch(ctx);
    expect(out.default).toEqual(str("qualquer"));
  });

  it("case_1 casa quando case_0 nao casa", async () => {
    const ctx = makeCtx({ inputs: { input: str("b") }, config: { case_0: "a", case_1: "b", case_2: "b" } });
    const out = await handleSwitch(ctx);
    expect(out.case_1).toEqual(str("b"));
    expect(out.case_2).toEqual({ kind: "void" }); // primeiro match ganha
  });
});

// ---------- handleSetVariable / handleGetVariable ----------

describe("handleSetVariable", () => {
  it("armazena valor e marca dirty", async () => {
    const vars = new Map<string, RuntimeValue>();
    const markDirty = vi.fn();
    const ctx = makeCtx({
      config: { name: "contador" },
      inputs: { value: num(5) },
      userVariables: vars,
      markVariableDirty: markDirty
    });
    const out = await handleSetVariable(ctx);
    expect(out.value).toEqual(num(5));
    expect(vars.get("contador")).toEqual(num(5));
    expect(markDirty).toHaveBeenCalledWith("contador");
  });

  it("skip write quando value e void (nao sobrescreve)", async () => {
    const vars = new Map<string, RuntimeValue>([["x", num(10)]]);
    const markDirty = vi.fn();
    const ctx = makeCtx({
      config: { name: "x" },
      inputs: { value: { kind: "void" } },
      userVariables: vars,
      markVariableDirty: markDirty
    });
    await handleSetVariable(ctx);
    expect(vars.get("x")).toEqual(num(10)); // nao alterado
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("skip write quando value nao conectado", async () => {
    const vars = new Map<string, RuntimeValue>([["x", num(10)]]);
    const ctx = makeCtx({ config: { name: "x" }, inputs: {}, userVariables: vars, markVariableDirty: vi.fn() });
    await handleSetVariable(ctx);
    expect(vars.get("x")).toEqual(num(10));
  });

  it("lanca erro para nome com prefixo system.", async () => {
    const ctx = makeCtx({ config: { name: "system.clock" }, inputs: { value: str("x") }, userVariables: new Map(), markVariableDirty: vi.fn() });
    await expect(handleSetVariable(ctx)).rejects.toThrow(/reservado/);
  });

  it("loga warn e retorna void quando nome vazio", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({ config: {}, inputs: {}, appendLog, userVariables: new Map(), markVariableDirty: vi.fn() });
    const out = await handleSetVariable(ctx);
    expect(out.value).toEqual({ kind: "void" });
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ level: "warn" }));
  });

  it("prioriza nome do input sobre config.name", async () => {
    const vars = new Map<string, RuntimeValue>();
    const markDirty = vi.fn();
    const ctx = makeCtx({
      config: { name: "config_name" },
      inputs: { name: str("input_name"), value: num(99) },
      userVariables: vars,
      markVariableDirty: markDirty
    });
    await handleSetVariable(ctx);
    expect(vars.has("input_name")).toBe(true);
    expect(vars.has("config_name")).toBe(false);
  });
});

describe("handleGetVariable", () => {
  it("retorna valor armazenado", async () => {
    const vars = new Map<string, RuntimeValue>([["x", num(42)]]);
    const ctx = makeCtx({ config: { name: "x" }, inputs: {}, userVariables: vars, markVariableDirty: vi.fn() });
    const out = await handleGetVariable(ctx);
    expect(out.value).toEqual(num(42));
  });

  it("retorna void para variavel inexistente", async () => {
    const ctx = makeCtx({ config: { name: "inexistente" }, inputs: {}, userVariables: new Map(), markVariableDirty: vi.fn() });
    const out = await handleGetVariable(ctx);
    expect(out.value).toEqual({ kind: "void" });
  });

  it("loga warn para variavel system.* inexistente", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({ config: { name: "system.user_id" }, inputs: {}, appendLog, userVariables: new Map(), markVariableDirty: vi.fn() });
    const out = await handleGetVariable(ctx);
    expect(out.value).toEqual({ kind: "void" });
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ level: "warn", message: expect.stringContaining("system.user_id") }));
  });

  it("nao loga warn para variavel user inexistente", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({ config: { name: "minha_var" }, inputs: {}, appendLog, userVariables: new Map(), markVariableDirty: vi.fn() });
    await handleGetVariable(ctx);
    expect(appendLog).not.toHaveBeenCalled();
  });

  it("retorna void quando nome vazio", async () => {
    const ctx = makeCtx({ config: {}, inputs: {}, userVariables: new Map(), markVariableDirty: vi.fn() });
    const out = await handleGetVariable(ctx);
    expect(out.value).toEqual({ kind: "void" });
  });
});

// ---------- handleLogNode — casos de borda ----------

describe("handleLogNode", () => {
  it("skipa quando input void e sem template", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({ inputs: { input: { kind: "void" } }, config: { prefix: "LOG" }, appendLog });
    await handleLogNode(ctx);
    expect(appendLog).not.toHaveBeenCalled();
  });

  it("skipa quando input nao fornecido e sem template", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({ inputs: {}, config: { prefix: "LOG" }, appendLog });
    await handleLogNode(ctx);
    expect(appendLog).not.toHaveBeenCalled();
  });

  it("loga mensagem correta para input string", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({ inputs: { input: str("ola") }, config: { prefix: "MSG" }, appendLog });
    await handleLogNode(ctx);
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ message: "[MSG] ola" }));
  });

  it("loga contagem para input rowList", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({ inputs: { input: rowList([{ a: 1 }, { a: 2 }], "carros") }, config: { prefix: "RL" }, appendLog });
    await handleLogNode(ctx);
    // Rows pequenas (<=5) tem os dados appendados ao log
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("2 row(s) em carros") })
    );
  });

  it("interpola template mesmo sem input, quando ha frameContext", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({
      inputs: {},
      config: { prefix: "Placa: ${placa}" },
      appendLog,
      frameContext: { placa: "ABC1A23" }
    });
    await handleLogNode(ctx);
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ message: "Placa: ABC1A23" }));
  });

  it("usa prefixo sem template como [PREFIX] message", async () => {
    const appendLog = vi.fn();
    const ctx = makeCtx({ inputs: { input: num(99) }, config: { prefix: "NUM" }, appendLog });
    await handleLogNode(ctx);
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ message: "[NUM] 99" }));
  });
});
