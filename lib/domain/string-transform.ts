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
  | { op: "trim" };

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
    case "partGt":
      return compareValues(value.split(cond.sep)[cond.index] ?? "", cond.value) > 0;
    case "partLt":
      return compareValues(value.split(cond.sep)[cond.index] ?? "", cond.value) < 0;
    default:
      return false;
  }
}

export function applyTransform(value: string, transform: TransformOp): string {
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
    default:
      return value;
  }
}

/** Aplica os passos em sequencia; cada passo so transforma se a condicao casar. */
export function applyTransformPipeline(value: string, steps: TransformStep[]): string {
  let current = value;
  for (const step of steps) {
    if (evalCondition(current, step.when)) {
      current = applyTransform(current, step.then);
    }
  }
  return current;
}
