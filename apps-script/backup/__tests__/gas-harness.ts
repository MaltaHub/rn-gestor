/**
 * Executa o backup-monolith.gs REAL em Node, contra um Sheets falso que reproduz o que
 * importa para a fidelidade: texto sem apostrofo e reinterpretado (numero, data, formula),
 * celula tem limite de 50.000 caracteres, aba nasce com 26 colunas x 1000 linhas e nao
 * aceita apagar todas as linhas nao congeladas.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

export type Cell = string | number | boolean | Date;

function typed(value: unknown): Cell {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return value as Cell;
  if (value.startsWith("'")) return limited(value.slice(1));
  if (value.startsWith("=")) return "#FORMULA!";
  if (/^-?\d+(\.\d+)?([eE]\d+)?$/.test(value)) return Number(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T03:00:00Z`);
  return limited(value);
}

function limited(value: string) {
  if (value.length > 50000) throw new Error("celula acima de 50000 caracteres");
  return value;
}

export class FakeSheet {
  cells: Cell[][] = [];
  maxRows = 1000;
  maxColumns = 26;
  frozen = 0;
  writes = 0;

  constructor(private name: string) {}

  getName() {
    return this.name;
  }
  getMaxRows() {
    return this.maxRows;
  }
  getMaxColumns() {
    return this.maxColumns;
  }
  getLastRow() {
    for (let r = this.cells.length - 1; r >= 0; r -= 1) {
      if (this.cells[r]?.some((cell) => cell !== "")) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    return this.cells.reduce((max, row) => {
      let last = row?.length ?? 0;
      while (last > 0 && (row[last - 1] ?? "") === "") last -= 1;
      return Math.max(max, last);
    }, 0);
  }
  setFrozenRows(count: number) {
    this.frozen = count;
  }
  insertRowsAfter(_after: number, count: number) {
    this.maxRows += count;
  }
  insertColumnsAfter(_after: number, count: number) {
    this.maxColumns += count;
  }
  deleteRow(row: number) {
    this.deleteRows(row, 1);
  }
  deleteRows(start: number, count: number) {
    if (this.maxRows - this.frozen <= count) throw new Error("nao e possivel apagar todas as linhas nao congeladas");
    this.cells.splice(start - 1, count);
    this.maxRows -= count;
  }
  getRange(row: number, column: number, rows = 1, columns = 1) {
    if (rows < 1 || columns < 1 || row + rows - 1 > this.maxRows || column + columns - 1 > this.maxColumns) {
      throw new Error(`intervalo fora da aba ${this.name}: ${row},${column},${rows},${columns}`);
    }
    const read = () =>
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: columns }, (_, c) => this.cells[row - 1 + r]?.[column - 1 + c] ?? "")
      );
    const write = (values: unknown[][]) => {
      if (values.length !== rows || values.some((line) => line.length !== columns)) {
        throw new Error("dimensoes diferentes do intervalo");
      }
      this.writes += 1;
      values.forEach((line, r) => {
        const target = (this.cells[row - 1 + r] ??= []);
        line.forEach((value, c) => {
          while (target.length < column - 1 + c) target.push("");
          target[column - 1 + c] = typed(value);
        });
      });
      for (let r = 0; r < this.cells.length; r += 1) this.cells[r] ??= [];
    };
    const range = {
      getValues: read,
      getDisplayValues: () => read().map((line) => line.map(String)),
      getValue: () => read()[0][0],
      setValues: write,
      setValue: (value: unknown) => write([[value]]),
      setFontWeight: () => range
    };
    return range;
  }
}

export function loadBackupScript(gsPath = path.resolve(__dirname, "../backup-monolith.gs")) {
  const sheets = new Map<string, FakeSheet>();
  const spreadsheet = {
    getSheetByName: (name: string) => sheets.get(name) ?? null,
    insertSheet: (name: string) => {
      const sheet = new FakeSheet(name);
      sheets.set(name, sheet);
      return sheet;
    }
  };
  const store = () => {
    const values = new Map<string, string>();
    return {
      getProperty: (key: string) => values.get(key) ?? null,
      setProperty: (key: string, value: string) => void values.set(key, value),
      get: (key: string) => values.get(key) ?? null,
      put: (key: string, value: string) => void values.set(key, value)
    };
  };
  const scriptProperties = store();
  scriptProperties.setProperty("WEBHOOK_TOKEN", "segredo");
  const documentProperties = store();
  const cache = store();
  const session = { visitor: "", owner: "dono@exemplo.com" };

  const context = vm.createContext({
    SpreadsheetApp: { getActive: () => spreadsheet, flush: () => undefined },
    PropertiesService: {
      getScriptProperties: () => scriptProperties,
      getDocumentProperties: () => documentProperties
    },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text: string) => ({ kind: "text", text, setMimeType() { return this; } })
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "all" },
      createTemplateFromFile: () => ({
        evaluate: () => ({ kind: "html", setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } })
      })
    },
    ScriptApp: { getService: () => ({ getUrl: () => "https://script.example/exec" }) },
    Session: {
      getActiveUser: () => ({ getEmail: () => session.visitor }),
      getEffectiveUser: () => ({ getEmail: () => session.owner }),
      getScriptTimeZone: () => "America/Sao_Paulo"
    },
    Utilities: {
      DigestAlgorithm: { MD5: "md5" },
      Charset: { UTF_8: "utf8" },
      // O Apps Script devolve bytes COM sinal.
      computeDigest: (_: string, text: string) => Array.from(new Int8Array(createHash("md5").update(text, "utf8").digest())),
      formatDate: (date: Date) => date.toISOString()
    }
  });
  vm.runInContext(readFileSync(gsPath, "utf8"), context, { filename: "backup-monolith.gs" });
  const script = context as unknown as Record<string, (...args: unknown[]) => unknown>;

  return {
    script,
    sheets,
    session,
    scriptProperties,
    post(body: unknown) {
      const output = script.doPost({ postData: { contents: JSON.stringify(body) } }) as { text: string };
      return JSON.parse(output.text);
    },
    /** Linhas de dados (3+) de uma aba como objetos. */
    rows(tab: string): Record<string, Cell>[] {
      const sheet = sheets.get(tab);
      if (!sheet) return [];
      const header = (sheet.cells[1] ?? []).map(String);
      return sheet.cells
        .slice(2, sheet.getLastRow())
        .map((line) => Object.fromEntries(header.map((name, i) => [name, line[i] ?? ""])));
    }
  };
}
