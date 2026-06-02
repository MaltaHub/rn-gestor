/**
 * Motor de formulas do playground (estilo planilha, pt-BR).
 *
 * Suporta DUAS formas de referencia:
 *  - Intervalos A1 estilo Excel: `B2`, `B2:D10` (le celulas renderizadas do grid,
 *    inclusive alimentadores).
 *  - Por coluna de alimentador: `nomeDoFeed.coluna` (segue o bloco ao mover).
 *
 * Funcoes: SOMA, MEDIA, CONT.NUM, CONT.SE, SOMASE, SE, MAXIMO, MINIMO
 * (+ aliases em ingles). Separador de argumentos: `;` (tambem aceita `,`).
 * Decimais com ponto. Comparadores: = <> > < >= <=.
 *
 * Modulo PURO: nao importa React, browser nem HTTP. A resolucao de celulas e de
 * colunas de alimentador e injetada via `FormulaContext`.
 */

export type FormulaScalar = number | string | boolean | null;
export type FormulaValue = FormulaScalar | FormulaScalar[];

export type CellRef = { row: number; col: number };

export type FormulaContext = {
  /** Valor (ja resolvido) de uma celula por coordenada 0-based. Formula -> deve resolver recursivamente. */
  getCellValue: (row: number, col: number) => FormulaScalar;
  /** Valores de uma coluna de alimentador/fragmento referenciada por `feed.coluna`. */
  getColumnValues: (feedRef: string, column: string) => FormulaScalar[];
};

export type FormulaResult = { value: FormulaScalar } | { error: string };

export class FormulaError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "FormulaError";
  }
}

export function isFormula(text: unknown): text is string {
  return typeof text === "string" && text.trim().startsWith("=") && text.trim().length > 1;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "colon" }
  | { type: "sep" };

// Inclui letras acentuadas (Latin-1 supplement, U+00C0–U+00FF) para nomes como MÉDIA/CONT.NÚM.
const IDENT_START = new RegExp("[A-Za-z\\u00c0-\\u00ff_]");
const IDENT_PART = new RegExp("[A-Za-z\\u00c0-\\u00ff0-9_.]");

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === '"') {
      let value = "";
      i += 1;
      while (i < input.length) {
        if (input[i] === '"') {
          if (input[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += input[i];
        i += 1;
      }
      tokens.push({ type: "str", value });
      continue;
    }

    if (ch >= "0" && ch <= "9") {
      let raw = "";
      while (i < input.length && ((input[i] >= "0" && input[i] <= "9") || input[i] === ".")) {
        raw += input[i];
        i += 1;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new FormulaError("#NUM!");
      tokens.push({ type: "num", value });
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "colon" });
      i += 1;
      continue;
    }
    if (ch === ";" || ch === ",") {
      tokens.push({ type: "sep" });
      i += 1;
      continue;
    }

    if (ch === ">" || ch === "<") {
      if (input[i + 1] === "=") {
        tokens.push({ type: "op", value: `${ch}=` });
        i += 2;
        continue;
      }
      if (ch === "<" && input[i + 1] === ">") {
        tokens.push({ type: "op", value: "<>" });
        i += 2;
        continue;
      }
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === "=" || ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }

    if (IDENT_START.test(ch)) {
      let value = "";
      while (i < input.length && IDENT_PART.test(input[i])) {
        value += input[i];
        i += 1;
      }
      tokens.push({ type: "ident", value });
      continue;
    }

    throw new FormulaError("#ERRO!");
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (descida recursiva)
// ---------------------------------------------------------------------------

type Node =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "cell"; ref: CellRef }
  | { kind: "range"; start: CellRef; end: CellRef }
  | { kind: "column"; feed: string; column: string }
  | { kind: "func"; name: string; args: Node[] }
  | { kind: "unary"; op: string; operand: Node }
  | { kind: "binary"; op: string; left: Node; right: Node };

const CELL_REF = /^([A-Za-z]+)(\d+)$/;

function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function parseCellRef(ident: string): CellRef | null {
  const match = CELL_REF.exec(ident);
  if (!match) return null;
  const col = columnLettersToIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (col < 0 || row < 0) return null;
  return { row, col };
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.parseExpr();
    if (this.pos < this.tokens.length) throw new FormulaError("#ERRO!");
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new FormulaError("#ERRO!");
    this.pos += 1;
    return token;
  }

  private parseExpr(): Node {
    return this.parseComparison();
  }

  private parseComparison(): Node {
    let left = this.parseAdditive();
    const token = this.peek();
    if (token?.type === "op" && ["=", "<>", ">", "<", ">=", "<="].includes(token.value)) {
      this.next();
      const right = this.parseAdditive();
      left = { kind: "binary", op: token.value, left, right };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (true) {
      const token = this.peek();
      if (token?.type === "op" && (token.value === "+" || token.value === "-")) {
        this.next();
        const right = this.parseMultiplicative();
        left = { kind: "binary", op: token.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (true) {
      const token = this.peek();
      if (token?.type === "op" && (token.value === "*" || token.value === "/")) {
        this.next();
        const right = this.parseUnary();
        left = { kind: "binary", op: token.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): Node {
    const token = this.peek();
    if (token?.type === "op" && token.value === "-") {
      this.next();
      return { kind: "unary", op: "-", operand: this.parseUnary() };
    }
    if (token?.type === "op" && token.value === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.next();

    if (token.type === "num") return { kind: "num", value: token.value };
    if (token.type === "str") return { kind: "str", value: token.value };

    if (token.type === "lparen") {
      const node = this.parseExpr();
      const close = this.next();
      if (close.type !== "rparen") throw new FormulaError("#ERRO!");
      return node;
    }

    if (token.type === "ident") {
      // Chamada de funcao: ident seguido de "(".
      if (this.peek()?.type === "lparen") {
        this.next();
        const args: Node[] = [];
        if (this.peek()?.type !== "rparen") {
          args.push(this.parseExpr());
          while (this.peek()?.type === "sep") {
            this.next();
            args.push(this.parseExpr());
          }
        }
        const close = this.next();
        if (close.type !== "rparen") throw new FormulaError("#ERRO!");
        return { kind: "func", name: token.value, args };
      }

      // Referencia de celula / intervalo (A1, A1:B10).
      const cell = parseCellRef(token.value);
      if (cell && !token.value.includes(".")) {
        if (this.peek()?.type === "colon") {
          this.next();
          const endToken = this.next();
          if (endToken.type !== "ident") throw new FormulaError("#REF!");
          const endCell = parseCellRef(endToken.value);
          if (!endCell) throw new FormulaError("#REF!");
          return { kind: "range", start: cell, end: endCell };
        }
        return { kind: "cell", ref: cell };
      }

      // Referencia por coluna de alimentador: feed.coluna.
      const dot = token.value.indexOf(".");
      if (dot > 0 && dot < token.value.length - 1) {
        return {
          kind: "column",
          feed: token.value.slice(0, dot),
          column: token.value.slice(dot + 1)
        };
      }

      throw new FormulaError("#NOME?");
    }

    throw new FormulaError("#ERRO!");
  }
}

// ---------------------------------------------------------------------------
// Coercoes e comparacoes
// ---------------------------------------------------------------------------

export function toNumber(value: FormulaScalar): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value == null) return NaN;
  const trimmed = String(value).trim();
  if (trimmed === "") return NaN;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : NaN;
}

function toBool(value: FormulaScalar): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value == null) return false;
  const trimmed = String(value).trim().toUpperCase();
  if (trimmed === "" || trimmed === "0" || trimmed === "FALSO" || trimmed === "FALSE") return false;
  return true;
}

function flattenNumbers(values: FormulaValue[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const num = toNumber(item);
      if (Number.isFinite(num)) out.push(num);
    }
  }
  return out;
}

function toArray(value: FormulaValue): FormulaScalar[] {
  return Array.isArray(value) ? value : [value];
}

function compareScalars(op: string, left: FormulaScalar, right: FormulaScalar): boolean {
  const ln = toNumber(left);
  const rn = toNumber(right);
  const bothNumeric = Number.isFinite(ln) && Number.isFinite(rn);

  if (bothNumeric) {
    switch (op) {
      case "=":
        return ln === rn;
      case "<>":
        return ln !== rn;
      case ">":
        return ln > rn;
      case "<":
        return ln < rn;
      case ">=":
        return ln >= rn;
      case "<=":
        return ln <= rn;
    }
  }

  const ls = left == null ? "" : String(left).trim().toUpperCase();
  const rs = right == null ? "" : String(right).trim().toUpperCase();
  switch (op) {
    case "=":
      return ls === rs;
    case "<>":
      return ls !== rs;
    case ">":
      return ls > rs;
    case "<":
      return ls < rs;
    case ">=":
      return ls >= rs;
    case "<=":
      return ls <= rs;
    default:
      throw new FormulaError("#ERRO!");
  }
}

/** Avalia um criterio estilo Excel ("=x", ">5", "<>y", ou valor simples) contra uma celula. */
function matchesCriteria(cellValue: FormulaScalar, criteria: FormulaScalar): boolean {
  if (typeof criteria === "number" || typeof criteria === "boolean") {
    return compareScalars("=", cellValue, criteria);
  }

  const raw = String(criteria ?? "").trim();
  const operatorMatch = /^(<>|>=|<=|>|<|=)(.*)$/.exec(raw);
  if (operatorMatch) {
    const op = operatorMatch[1];
    const operand = operatorMatch[2].trim();
    return compareScalars(op, cellValue, operand);
  }

  return compareScalars("=", cellValue, raw);
}

// ---------------------------------------------------------------------------
// Funcoes
// ---------------------------------------------------------------------------

const FUNCTION_ALIASES: Record<string, string> = {
  SUM: "SOMA",
  AVERAGE: "MEDIA",
  COUNT: "CONT.NUM",
  COUNTIF: "CONT.SE",
  SUMIF: "SOMASE",
  IF: "SE",
  MAX: "MAXIMO",
  MIN: "MINIMO"
};

/** Combining diacritical marks (U+0300-U+036F) — usado para remover acentos. */
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Normaliza nome de funcao: maiusculas, sem acentos, mantendo o ponto. */
function normalizeFunctionName(name: string): string {
  const upper = name.toUpperCase().normalize("NFD").replace(DIACRITICS, "");
  return FUNCTION_ALIASES[upper] ?? upper;
}

function callFunction(name: string, args: FormulaValue[]): FormulaValue {
  switch (name) {
    case "SOMA":
      return flattenNumbers(args).reduce((acc, value) => acc + value, 0);

    case "MEDIA": {
      const numbers = flattenNumbers(args);
      if (numbers.length === 0) throw new FormulaError("#DIV/0!");
      return numbers.reduce((acc, value) => acc + value, 0) / numbers.length;
    }

    case "CONT.NUM":
      return flattenNumbers(args).length;

    case "MAXIMO": {
      const numbers = flattenNumbers(args);
      return numbers.length === 0 ? 0 : Math.max(...numbers);
    }

    case "MINIMO": {
      const numbers = flattenNumbers(args);
      return numbers.length === 0 ? 0 : Math.min(...numbers);
    }

    case "SE": {
      if (args.length < 2) throw new FormulaError("#ERRO!");
      const cond = toBool(scalarOf(args[0]));
      if (cond) return scalarOf(args[1]);
      return args.length >= 3 ? scalarOf(args[2]) : false;
    }

    case "CONT.SE": {
      if (args.length < 2) throw new FormulaError("#ERRO!");
      const range = toArray(args[0]);
      const criteria = scalarOf(args[1]);
      return range.filter((value) => matchesCriteria(value, criteria)).length;
    }

    case "SOMASE": {
      if (args.length < 2) throw new FormulaError("#ERRO!");
      const range = toArray(args[0]);
      const criteria = scalarOf(args[1]);
      const sumRange = args.length >= 3 ? toArray(args[2]) : range;
      let total = 0;
      for (let index = 0; index < range.length; index += 1) {
        if (matchesCriteria(range[index], criteria)) {
          const num = toNumber(sumRange[index] ?? null);
          if (Number.isFinite(num)) total += num;
        }
      }
      return total;
    }

    default:
      throw new FormulaError("#NOME?");
  }
}

/** Reduz um FormulaValue a escalar (intervalo de 1 -> elemento; vazio -> null; multiplos -> erro). */
function scalarOf(value: FormulaValue): FormulaScalar {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return null;
  if (value.length === 1) return value[0];
  throw new FormulaError("#VALOR!");
}

// ---------------------------------------------------------------------------
// Avaliacao
// ---------------------------------------------------------------------------

function evalNode(node: Node, ctx: FormulaContext): FormulaValue {
  switch (node.kind) {
    case "num":
      return node.value;
    case "str":
      return node.value;
    case "cell":
      return ctx.getCellValue(node.ref.row, node.ref.col);
    case "range": {
      const minRow = Math.min(node.start.row, node.end.row);
      const maxRow = Math.max(node.start.row, node.end.row);
      const minCol = Math.min(node.start.col, node.end.col);
      const maxCol = Math.max(node.start.col, node.end.col);
      const values: FormulaScalar[] = [];
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          values.push(ctx.getCellValue(row, col));
        }
      }
      return values;
    }
    case "column":
      return ctx.getColumnValues(node.feed, node.column);
    case "unary": {
      const operand = toNumber(scalarOf(evalNode(node.operand, ctx)));
      if (!Number.isFinite(operand)) throw new FormulaError("#VALOR!");
      return -operand;
    }
    case "binary": {
      if (["=", "<>", ">", "<", ">=", "<="].includes(node.op)) {
        return compareScalars(node.op, scalarOf(evalNode(node.left, ctx)), scalarOf(evalNode(node.right, ctx)));
      }
      const left = toNumber(scalarOf(evalNode(node.left, ctx)));
      const right = toNumber(scalarOf(evalNode(node.right, ctx)));
      if (!Number.isFinite(left) || !Number.isFinite(right)) throw new FormulaError("#VALOR!");
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          if (right === 0) throw new FormulaError("#DIV/0!");
          return left / right;
        default:
          throw new FormulaError("#ERRO!");
      }
    }
    case "func":
      return callFunction(normalizeFunctionName(node.name), node.args.map((arg) => evalNode(arg, ctx)));
    default:
      throw new FormulaError("#ERRO!");
  }
}

export function evaluateFormula(formula: string, ctx: FormulaContext): FormulaResult {
  try {
    const body = formula.trim().replace(/^=/, "");
    const tokens = tokenize(body);
    if (tokens.length === 0) throw new FormulaError("#ERRO!");
    const ast = new Parser(tokens).parse();
    const value = scalarOf(evalNode(ast, ctx));
    return { value };
  } catch (error) {
    if (error instanceof FormulaError) return { error: error.code };
    return { error: "#ERRO!" };
  }
}
