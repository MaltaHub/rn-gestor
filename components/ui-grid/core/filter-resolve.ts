import type { GridFilters, SheetKey } from "@/components/ui-grid/types";
import { splitConjunction, type FilterNode } from "@/components/ui-grid/core/filter-predicate";

/**
 * Resolucao de filtros aninhados NO CLIENT (fase 2, escopo playground).
 *
 * Estrategia: cada predicado de relacao vira uma lista `IN` numa coluna. Para
 * isso consultamos a tabela relacionada (com os sub-filtros ja resolvidos) e
 * pegamos as chaves correspondentes; depois aplicamos `coluna = k1|k2|...` no
 * GridFilters do alvo. Assim o caminho de query do grid fica intacto — a relacao
 * eh "achatada" numa condicao IN antes do fetch. A recursao acontece resolvendo
 * o `where` de cada relacao antes de buscar suas chaves (subquery dentro de
 * subquery).
 *
 * Limite: relacao que nao casa nenhuma linha vira um filtro que nao casa nada
 * (sentinela), para o alvo ficar vazio em vez de mostrar tudo.
 */

/** Sentinela aplicada quando a relacao nao retorna nenhuma chave (alvo vazio). */
export const RELATION_NO_MATCH_LITERAL = "=__sem_correspondencia__";

export type RelationKeyFetcher = (params: {
  table: SheetKey;
  /** Filtros (folhas) ja resolvidos da tabela relacionada. */
  filters: GridFilters;
  /** Coluna-chave a coletar (valores distintos). */
  keyColumn: string;
}) => Promise<{ keys: string[]; truncated: boolean }>;

export type ResolvedFilters = {
  filters: GridFilters;
  /** true se alguma sub-consulta atingiu o teto de linhas (resultado pode estar incompleto). */
  truncated: boolean;
};

/**
 * Achata uma arvore de predicados em GridFilters, resolvendo relacoes via
 * `fetchKeys`. Recursiva: o `where` de cada relacao eh resolvido primeiro.
 */
export async function resolveFilterNodeToGridFilters(
  node: FilterNode | null,
  fetchKeys: RelationKeyFetcher
): Promise<ResolvedFilters> {
  const split = splitConjunction(node);
  const filters: GridFilters = { ...split.leafFilters };
  let truncated = false;

  for (const relation of split.relations) {
    // 1) resolve o sub-predicado da tabela relacionada (pode ter outras relacoes).
    const sub = await resolveFilterNodeToGridFilters(relation.where, fetchKeys);
    truncated = truncated || sub.truncated;

    // 2) busca as chaves correspondentes na tabela relacionada.
    const result = await fetchKeys({
      table: relation.table,
      filters: sub.filters,
      keyColumn: relation.keyColumn
    });
    truncated = truncated || result.truncated;

    const keys = dedupeKeys(result.keys);

    // 3) achata na coluna local e COMBINA (AND) com o que ja houver nela:
    //    - negada: EXCETO das chaves (sem chaves nao ha o que excluir);
    //    - normal: IN das chaves (sem chaves -> sentinela = alvo vazio).
    if (relation.negate) {
      if (keys.length === 0) continue;
      filters[relation.column] = combineColumnExpressions(filters[relation.column], `${EXCLUSION_PREFIX}${keys.join("|")}`);
    } else {
      filters[relation.column] = combineColumnExpressions(filters[relation.column], buildInExpression(keys));
    }
  }

  return { filters, truncated };
}

const EXCLUSION_PREFIX = "EXCETO ";

type ColumnConstraint =
  | { kind: "in"; values: string[] }
  | { kind: "not"; values: string[] }
  | { kind: "other"; expression: string };

const OPERATOR_PREFIXES = [">=", "<=", "!=", ">", "<"];

function splitList(raw: string): string[] {
  return raw
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Le uma expressao do DSL como conjunto (IN / EXCETO) quando possivel. */
function parseColumnConstraint(expression: string): ColumnConstraint {
  const trimmed = expression.trim();
  const upper = trimmed.toUpperCase();
  if (upper.startsWith(EXCLUSION_PREFIX)) {
    return { kind: "not", values: splitList(trimmed.slice(EXCLUSION_PREFIX.length)) };
  }
  if (upper === "VAZIO" || upper === "!VAZIO" || OPERATOR_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return { kind: "other", expression: trimmed };
  }
  if (trimmed.startsWith("=")) return { kind: "in", values: [trimmed.slice(1).trim()] };
  if (trimmed.includes("|")) return { kind: "in", values: splitList(trimmed) };
  // Texto puro = ILIKE no servidor: nao e um conjunto de chaves.
  return { kind: "other", expression: trimmed };
}

/**
 * IN no DSL. Uma chave so vira "=k": sem o "=", o servidor le texto puro como
 * ILIKE (casava "c1" com "c10" e quebrava em coluna uuid). Sem chaves, sentinela.
 */
function buildInExpression(keys: string[]): string {
  const values = dedupeKeys(keys);
  if (values.length === 0) return RELATION_NO_MATCH_LITERAL;
  if (values.length === 1) return `=${values[0]}`;
  return values.join("|");
}

/**
 * AND de duas condicoes na MESMA coluna, quando representavel no DSL:
 * IN∧IN = intersecao, IN∧EXCETO = diferenca, EXCETO∧EXCETO = uniao. Fora
 * disso (faixas, VAZIO, texto) nao ha como expressar os dois: vence a nova.
 */
export function combineColumnExpressions(existing: string | undefined, next: string): string {
  if (!existing || !existing.trim()) return next;
  const a = parseColumnConstraint(existing);
  const b = parseColumnConstraint(next);

  if (a.kind === "not" && b.kind === "not") {
    return `${EXCLUSION_PREFIX}${dedupeKeys([...a.values, ...b.values]).join("|")}`;
  }
  if (a.kind === "in" && b.kind === "in") {
    const allowed = new Set(b.values);
    return buildInExpression(a.values.filter((value) => allowed.has(value)));
  }
  if (a.kind === "in" && b.kind === "not") {
    const blocked = new Set(b.values);
    return buildInExpression(a.values.filter((value) => !blocked.has(value)));
  }
  if (a.kind === "not" && b.kind === "in") {
    const blocked = new Set(a.values);
    return buildInExpression(b.values.filter((value) => !blocked.has(value)));
  }
  return next;
}

/** `EXCETO` com a uniao das exclusoes ja presentes na expressao e das novas chaves. */
export function mergeExclusionExpression(existing: string | undefined, keys: string[]): string {
  return combineColumnExpressions(existing, `${EXCLUSION_PREFIX}${dedupeKeys(keys).join("|")}`);
}

/**
 * Aplica os filtros resolvidos (relacoes) sobre os filtros-base do alvo,
 * combinando por coluna (ver combineColumnExpressions). Ex.: o pai exclui
 * fragmentos por valor (EXCETO base) E por nome (EXCETO resolvido) ao mesmo
 * tempo; um fragmento por nome (IN resolvido) respeita os valores ja tomados
 * por fragmentos por valor (EXCETO base).
 */
export function mergeResolvedGridFilters(base: GridFilters, resolved: GridFilters): GridFilters {
  const merged: GridFilters = { ...base };
  for (const [column, expression] of Object.entries(resolved)) {
    merged[column] = combineColumnExpressions(merged[column], expression);
  }
  return merged;
}

function dedupeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const value = String(key);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
