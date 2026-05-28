/**
 * lib/domain/string-transform.ts
 *
 * Motor de transformacao de strings para o "Alteracao em massa" avancado.
 *
 * SEM eval: o pipeline e DADO (lista de passos), aplicado por funcoes puras
 * com um conjunto fixo de operacoes. Cada passo e "[Se <condicao>] entao
 * <transformacao>", aplicado em sequencia sobre o valor de cada linha.
 *
 * Exemplos do usuario:
 *   - Se length > 3, concatene '_'              -> { when: lengthGt(3), then: suffix('_') }
 *   - Se split('_')[0] > '300', concatene 'alto' -> { when: partGt('_',0,'300'), then: suffix('alto') }
 */

export type TransformOp =
  | { op: "prefix"; text: string }
  | { op: "suffix"; text: string }
  | { op: "set"; text: string }
  | { op: "replace"; find: string; replace: string }
  | { op: "splitJoin"; sep: string; join: string }
  | { op: "take"; sep: string; index: number }
  | { op: "slice"; start: number; end: number | null }
  | { op: "upper" }
  | { op: "lower" }
  | { op: "trim" }
  | { op: "add"; n: number }
  | { op: "subtract"; n: number }
  | { op: "multiply"; n: number }
  | { op: "divide"; n: number }
  | { op: "round"; decimals: number }
  | { op: "sequence"; start: number; step: number; pad: number }
  | { op: "dateFormat"; format: "br" | "br_time" | "iso" }
  | { op: "regexReplace"; pattern: string; flags: string; replace: string };

export type ConditionOp =
  | { op: "always" }
  | { op: "lengthGt"; n: number }
  | { op: "lengthLt"; n: number }
  | { op: "lengthEq"; n: number }
  | { op: "contains"; text: string }
  | { op: "startsWith"; text: string }
  | { op: "endsWith"; text: string }
  | { op: "equals"; text: string }
  | { op: "isEmpty" }
  | { op: "notEmpty" }
  | { op: "matches"; pattern: string; flags: string }
  | { op: "valueGt"; value: string }
  | { op: "valueLt"; value: string }
  | { op: "partGt"; sep: string; index: number; value: string }
  | { op: "partLt"; sep: string; index: number; value: string };

export type TransformStep = { when: ConditionOp; then: TransformOp };

/** Compara numericamente quando ambos sao numeros; senao, lexicograficamente. */
function compareValues(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (a.trim() !== "" && b.trim() !== "" && Number.isFinite(na) && Number.isFinite(nb)) {
    return na - nb;
  }
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function evalCondition(value: string, cond: ConditionOp): boolean {
  switch (cond.op) {
    case "always":
      return true;
    case "lengthGt":
      return value.length > cond.n;
    case "lengthLt":
      return value.length < cond.n;
    case "lengthEq":
      return value.length === cond.n;
    case "contains":
      return value.includes(cond.text);
    case "startsWith":
      return value.startsWith(cond.text);
    case "endsWith":
      return value.endsWith(cond.text);
    case "equals":
      return value === cond.text;
    case "isEmpty":
      return value.trim() === "";
    case "notEmpty":
      return value.trim() !== "";
    case "matches":
      try {
        return new RegExp(cond.pattern, cond.flags || "").test(value);
      } catch {
        return false;
      }
    case "valueGt":
      return compareValues(value, cond.value) > 0;
    case "valueLt":
      return compareValues(value, cond.value) < 0;
    case "partGt":
      return compareValues(value.split(cond.sep)[cond.index] ?? "", cond.value) > 0;
    case "partLt":
      return compareValues(value.split(cond.sep)[cond.index] ?? "", cond.value) < 0;
    default:
      return false;
  }
}

/** Converte o valor para numero (aceita virgula decimal); null se nao for numero. */
function toNumber(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Aplica uma operacao numerica preservando o valor original quando nao for numero. */
function numeric(value: string, fn: (n: number) => number): string {
  const n = toNumber(value);
  if (n === null) return value;
  const result = fn(n);
  return Number.isFinite(result) ? String(result) : value;
}

/** Contexto opcional por linha (ex.: indice para numeracao sequencial). */
export type TransformContext = { index: number };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(value: string, format: "br" | "br_time" | "iso"): string {
  const raw = value.trim();
  // Data-only (YYYY-MM-DD): parse os componentes direto pra evitar o shift de
  // fuso (Date.parse trata como UTC e getDate() local rola pro dia anterior).
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, yyyy, mm, dd] = dateOnly;
    if (format === "iso") return `${yyyy}-${mm}-${dd}`;
    if (format === "br_time") return `${dd}/${mm}/${yyyy} 00:00`;
    return `${dd}/${mm}/${yyyy}`;
  }
  const time = Date.parse(raw);
  if (Number.isNaN(time)) return value;
  const d = new Date(time);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  if (format === "iso") return `${yyyy}-${mm}-${dd}`;
  if (format === "br_time") return `${dd}/${mm}/${yyyy} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${dd}/${mm}/${yyyy}`;
}

export function applyTransform(value: string, transform: TransformOp, ctx?: TransformContext): string {
  switch (transform.op) {
    case "prefix":
      return transform.text + value;
    case "suffix":
      return value + transform.text;
    case "set":
      return transform.text;
    case "replace":
      return transform.find === "" ? value : value.split(transform.find).join(transform.replace);
    case "splitJoin":
      return value.split(transform.sep).join(transform.join);
    case "take":
      return value.split(transform.sep)[transform.index] ?? "";
    case "slice":
      return value.slice(transform.start, transform.end ?? undefined);
    case "upper":
      return value.toUpperCase();
    case "lower":
      return value.toLowerCase();
    case "trim":
      return value.trim();
    case "add":
      return numeric(value, (n) => n + transform.n);
    case "subtract":
      return numeric(value, (n) => n - transform.n);
    case "multiply":
      return numeric(value, (n) => n * transform.n);
    case "divide":
      return numeric(value, (n) => (transform.n === 0 ? n : n / transform.n));
    case "round":
      return numeric(value, (n) => Number(n.toFixed(Math.min(10, Math.max(0, transform.decimals)))));
    case "sequence": {
      const n = transform.start + (ctx?.index ?? 0) * transform.step;
      const text = String(n);
      return transform.pad > 0 ? text.padStart(transform.pad, "0") : text;
    }
    case "dateFormat":
      return formatDate(value, transform.format);
    case "regexReplace":
      try {
        return value.replace(new RegExp(transform.pattern, transform.flags || "g"), transform.replace);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

/** Aplica os passos em sequencia; cada passo so transforma se a condicao casar. */
export function applyTransformPipeline(value: string, steps: TransformStep[], ctx?: TransformContext): string {
  let current = value;
  for (const step of steps) {
    if (evalCondition(current, step.when)) {
      current = applyTransform(current, step.then, ctx);
    }
  }
  return current;
}
