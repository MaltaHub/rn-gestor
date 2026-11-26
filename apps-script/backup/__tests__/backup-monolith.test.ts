import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBackupScript } from "./gas-harness";

/** Fora do espelho de proposito: log de auditoria (volume) e telemetria. */
const OUTSIDE_BACKUP = ["client_errors", "log_alteracoes"];

function databaseTables() {
  const source = readFileSync(path.resolve(__dirname, "../../../lib/supabase/database.types.ts"), "utf8");
  const publicSchema = source.slice(source.indexOf("\n  public: {"));
  const section = publicSchema.slice(publicSchema.indexOf("    Tables: {"), publicSchema.indexOf("    Views: {"));
  const tables: Record<string, string[]> = {};
  for (const match of section.matchAll(/^ {6}(\w+): \{\r?\n {8}Row: \{\r?\n([\s\S]*?)\r?\n {8}\}/gm)) {
    tables[match[1]] = [...match[2].matchAll(/^ {10}(\w+):/gm)].map((column) => column[1]).sort();
  }
  return tables;
}

type Registry = Record<string, { pk: string[]; cols: string[] }>;
type Result = { ok: boolean; table: string; key: string; error?: string; unchanged?: boolean };

const send = (gas: ReturnType<typeof loadBackupScript>, ops: unknown[]) =>
  gas.post({ token: "segredo", ops }) as { ok: boolean; results: Result[] };

const carro = (row: Record<string, unknown>) => ({ table: "carros", key: String(row.id), op: "upsert", row });

describe("backup-monolith.gs", () => {
  it("registry cobre todas as tabelas e colunas do banco", () => {
    const registry = loadBackupScript().script.backupRegistry_() as unknown as Registry;
    const tables = databaseTables();
    const expected = Object.keys(tables).filter((name) => !OUTSIDE_BACKUP.includes(name)).sort();

    expect(expected.length).toBeGreaterThan(30);
    expect(Object.keys(registry).sort()).toEqual(expected);
    for (const name of expected) {
      expect([...registry[name].cols].sort(), name).toEqual(tables[name]);
    }
  });

  it("guarda texto como texto: zeros a esquerda, 44 digitos, data e formula", () => {
    const gas = loadBackupScript();
    const row = {
      id: "a1",
      renavam: "00123456789",
      chassi: "35260912345678000199550010000012341000012345",
      data_entrada: "2026-01-02",
      placa: "=1+1",
      hodometro: 1000
    };
    expect(send(gas, [carro(row)]).results[0].ok).toBe(true);
    expect(gas.rows("carros")[0]).toMatchObject(row);

    // Regravar outro campo nao pode reinterpretar os que ficaram como estavam.
    send(gas, [carro({ id: "a1", hodometro: 2000 })]);
    expect(gas.rows("carros")[0]).toMatchObject({ ...row, hodometro: 2000 });
  });

  it("aplica o lote com uma escrita por faixa e nao regrava linha igual", () => {
    const gas = loadBackupScript();
    const ops = Array.from({ length: 1200 }, (_, i) => carro({ id: `c${i}`, placa: `P${i}` }));
    expect(send(gas, ops).results.every((result) => result.ok)).toBe(true);
    const sheet = gas.sheets.get("carros")!;
    expect(gas.rows("carros")).toHaveLength(1200);

    const before = sheet.writes;
    const again = send(gas, ops);
    expect(again.results.every((result) => result.unchanged)).toBe(true);
    expect(sheet.writes).toBe(before);

    send(gas, [carro({ id: "c10", placa: "X" }), carro({ id: "c11", placa: "Y" }), carro({ id: "c12", placa: "Z" })]);
    expect(sheet.writes).toBe(before + 1);
  });

  it("apaga so as linhas pedidas, inclusive todas de uma vez", () => {
    const gas = loadBackupScript();
    const ids = Array.from({ length: 1100 }, (_, i) => `c${i}`);
    send(gas, ids.map((id) => carro({ id })));
    const remove = (list: string[]) =>
      send(gas, list.map((id) => ({ table: "carros", key: id, op: "delete", row: { id } })));

    remove(["c0", "c5", "c6", "c1099"]);
    expect(gas.rows("carros")).toHaveLength(1096);
    expect(remove(ids).results.every((result) => result.ok)).toBe(true);
    expect(gas.rows("carros")).toHaveLength(0);
  });

  it("uma operacao rejeitada nao derruba as outras", () => {
    const gas = loadBackupScript();
    const response = send(gas, [
      { table: "nao_existe", key: "1", op: "upsert", row: { id: "1" } },
      carro({ id: "a1" }),
      { table: "carros", key: "", op: "upsert", row: { placa: "sem pk" } }
    ]);
    expect(response.ok).toBe(true);
    expect(response.results.map((result) => result.ok)).toEqual([false, true, false]);
    expect(response.results[0].error).toContain("BACKUP_UNKNOWN_TABLE");
    expect(gas.rows("carros")).toHaveLength(1);
  });

  it("parte celulas acima do limite do Sheets e remonta o texto", () => {
    const gas = loadBackupScript();
    const conteudo = "<p>ção 😀</p>\n".repeat(12000);
    const op = { table: "venda_documentos", key: "d1", op: "upsert", row: { id: "d1", conteudo } };
    expect(send(gas, [op]).results[0].ok).toBe(true);
    expect(gas.rows("CORE_OVERFLOW").map((part) => part.texto).join("")).toBe(conteudo);

    expect(send(gas, [op]).results[0].unchanged).toBe(true);
    send(gas, [{ ...op, row: { id: "d1", conteudo: "curto" } }]);
    expect(gas.rows("CORE_OVERFLOW")).toHaveLength(0);
    expect(gas.rows("venda_documentos")[0].conteudo).toBe("curto");
  });

  it("calcula a mesma assinatura que internal.backup_assinatura", () => {
    // Gerado pelo Postgres: backup_normalizar + backup_assinatura sobre esta linha.
    const linha = {
      id: "a1",
      obs: "á\r\nb",
      info: '{"a": [2], "b": 1}',
      ativo: true,
      preco: 50000.5,
      vazio: null,
      renavam: "00123"
    };
    const script = loadBackupScript().script;
    expect(script.backupSignature_(Object.keys(linha), linha)).toBe("e043e41c34f3fa103d10f9c99045daac");
  });

  it("validacao aponta o que falta, difere e sobra, sem acusar o que esta a caminho", () => {
    const gas = loadBackupScript();
    const cols = ["id", "renavam"];
    const sign = (row: Record<string, string>) => gas.script.backupSignature_(cols, row) as unknown as string;
    send(gas, ["ok", "corrompida", "sobrando", "a-caminho"].map((id) => carro({ id, renavam: "0099" })));
    const sheet = gas.sheets.get("carros")!;
    const header = sheet.cells[1];
    sheet.cells[3][header.indexOf("renavam")] = 99; // o que o Sheets fazia antes

    const response = gas.post({
      token: "segredo",
      action: "verify",
      table: "carros",
      pk: ["id"],
      cols,
      rows: [
        ["ok", sign({ id: "ok", renavam: "0099" })],
        ["corrompida", sign({ id: "corrompida", renavam: "0099" })],
        ["perdida", sign({ id: "perdida", renavam: "1" })],
        ["a-caminho", "*"]
      ]
    });

    expect(response).toMatchObject({
      ok: true,
      sheetRows: 4,
      missing: ["perdida"],
      different: ["corrompida"],
      orphan: ["sobrando"]
    });
    expect(gas.rows("CORE_VALIDATION")[0]).toMatchObject({ tabela: "carros", faltando: 1, diferentes: 1, sobrando: 1 });
  });

  it("exige o token", () => {
    expect(loadBackupScript().post({ token: "errado", ops: [] })).toMatchObject({ ok: false, error: "BACKUP_UNAUTHORIZED" });
  });

  it("grid web recusa anonimo e aceita o dono ou a chave", () => {
    const gas = loadBackupScript();
    const open = (parameter: Record<string, string> = {}) =>
      (gas.script.doGet({ parameter }) as unknown as { kind: string }).kind;

    expect(open()).toBe("text");
    gas.session.visitor = "outra@exemplo.com";
    expect(open()).toBe("text");
    gas.session.visitor = gas.session.owner;
    expect(open()).toBe("html");

    gas.session.visitor = "";
    gas.scriptProperties.setProperty("GRID_KEY", "curta");
    expect(open({ k: "curta" })).toBe("text");
    gas.scriptProperties.setProperty("GRID_KEY", "k".repeat(32));
    expect(open({ k: "k".repeat(32) })).toBe("html");
  });

  it("importador de CSV tambem preserva o texto", () => {
    const gas = loadBackupScript();
    gas.script.importCsv("carros", "id,renavam\na1,00123456789\n", false);
    gas.script.importCsv("carros", "id,renavam\na2,000\n", false);
    expect(gas.rows("carros").map((row) => row.renavam)).toEqual(["00123456789", "000"]);
  });
});
