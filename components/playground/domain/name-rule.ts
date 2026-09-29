import type { SheetKey } from "@/components/ui-grid/types";
import { filterLeaf, filterRelation, type FilterNode, type FilterRelation } from "@/components/ui-grid/core/filter-predicate";
import { getRelationFor } from "@/components/ui-grid/core/relations";
import { resolveRelationPath } from "@/components/ui-grid/core/relation-path";
import type { PlaygroundFeedFragment, PlaygroundFeedQuery, PlaygroundFragmentNameRule } from "@/components/playground/types";

/**
 * Fragmento "Por nome": em vez de uma lista FIXA de valores, guarda uma REGRA
 * ("<campo> contem <chave>") avaliada a cada busca de dados. Assim, quando a
 * tabela muda (entra um modelo "ONIX 1.4" novo), o fragmento ja o inclui e o
 * alimentador pai ja o exclui — sem o usuario reeditar o fragmento.
 *
 * - Coluna comum (path ""): o fragmento filtra `coluna` por texto (ilike no
 *   servidor). O pai exclui via auto-relacao negada: busca os valores distintos
 *   que casam e aplica `EXCETO v1|v2`.
 * - Coluna FK (path = campo da tabela relacionada, ex.: "nome" ou
 *   "marca_id>nome"): vira um predicado de relacao (`modelo_id` IN ids de modelos
 *   cujo nome contem a chave), resolvido no client a cada fetch; o pai usa o
 *   mesmo predicado negado.
 */

/**
 * Limpa a chave para ela nao ser interpretada como operador do DSL de filtros
 * (=, >, <, !, a|b, EXCETO, VAZIO). Retorna "" se nada util sobrar.
 */
export function sanitizeNameRuleKey(raw: string): string {
  let key = (raw ?? "").replace(/\|/g, " ").trim();
  key = key.replace(/^[=<>!]+/, "").trim();
  // "VAZIO" (exato) e "EXCETO ..." sao operadores no servidor.
  if (/^vazio$/i.test(key) || /^exceto\s/i.test(key)) return "";
  return key;
}

export function isNameRuleFragment(fragment: Pick<PlaygroundFeedFragment, "kind" | "nameRule">): boolean {
  return fragment.kind === "name" && Boolean(fragment.nameRule?.key);
}

/** Literal canonico (identidade/estabilidade de id) de uma regra por nome. */
export function buildNameRuleValueLiteral(rule: PlaygroundFragmentNameRule): string {
  return rule.path ? `nome:${rule.path}~${rule.key}` : `nome:~${rule.key}`;
}

export function describeNameRule(rule: PlaygroundFragmentNameRule): string {
  return `contém “${rule.key}”`;
}

/** Sub-predicado "caminho contem chave" a partir da tabela relacionada. */
function buildPathWhere(baseTable: SheetKey, baseKeyColumn: string, path: string, key: string): FilterNode | null {
  const resolved = resolveRelationPath({ table: baseTable, keyColumn: baseKeyColumn }, path);
  if (!resolved) return null;

  // Monta de dentro para fora: a folha vive na ultima tabela do caminho e cada
  // salto (FK intermediaria) embrulha o predicado numa relacao.
  let node: FilterNode = filterLeaf(resolved.displayColumn, key);
  for (let index = resolved.hops.length - 1; index >= 0; index -= 1) {
    const hop = resolved.hops[index];
    node = filterRelation({
      column: hop.column,
      table: hop.relation.table,
      keyColumn: hop.relation.keyColumn,
      where: node
    });
  }
  return node;
}

/**
 * Predicado de relacao da regra, aplicado na tabela do alimentador. Com
 * `negate`, exclui (EXCETO) as chaves que casam — usado pelo alimentador pai.
 */
export function buildNameRuleRelation(params: {
  table: SheetKey;
  sourceColumn: string;
  rule: PlaygroundFragmentNameRule;
  negate?: boolean;
}): FilterRelation | null {
  const key = sanitizeNameRuleKey(params.rule.key);
  if (!key || !params.sourceColumn) return null;

  if (!params.rule.path) {
    // Auto-relacao: valores distintos da propria coluna que contem a chave.
    return filterRelation({
      column: params.sourceColumn,
      table: params.table,
      keyColumn: params.sourceColumn,
      where: filterLeaf(params.sourceColumn, key),
      negate: params.negate
    });
  }

  const relation = getRelationFor(params.table, params.sourceColumn);
  if (!relation) return null;
  const where = buildPathWhere(relation.table, relation.keyColumn, params.rule.path, key);
  if (!where) return null;

  return filterRelation({
    column: params.sourceColumn,
    table: relation.table,
    keyColumn: relation.keyColumn,
    where,
    negate: params.negate
  });
}

/**
 * Filtros do FRAGMENTO para a regra: coluna comum filtra direto por texto no
 * servidor (sem teto de linhas); FK vira relacao resolvida a cada fetch.
 */
export function buildNameRuleFragmentFilters(params: {
  table: SheetKey;
  sourceColumn: string;
  rule: PlaygroundFragmentNameRule;
}): { filterExpression: string | null; relation: FilterRelation | null } {
  const key = sanitizeNameRuleKey(params.rule.key);
  if (!key) return { filterExpression: null, relation: null };
  if (!params.rule.path) return { filterExpression: key, relation: null };
  return { filterExpression: null, relation: buildNameRuleRelation(params) };
}

/**
 * Query EXECUTAVEL de um fragmento por nome, remontada a cada build de targets
 * com PRECEDENCIA para cada linha cair num fragmento so: valores ja tomados por
 * fragmentos por valor (mesma coluna) e regras por nome ANTERIORES ficam de
 * fora. Sem nada a excluir numa coluna comum, filtra direto por texto no
 * servidor; senao usa a regra como relacao (IN) para poder subtrair.
 */
export function buildNameRuleTargetQuery(params: {
  table: SheetKey;
  sourceColumn: string;
  rule: PlaygroundFragmentNameRule;
  query: PlaygroundFeedQuery;
  takenLiterals: string[];
  earlierRules: PlaygroundFragmentNameRule[];
}): PlaygroundFeedQuery {
  const positive = buildNameRuleRelation({ table: params.table, sourceColumn: params.sourceColumn, rule: params.rule });
  if (!positive) return params.query;

  const filters = { ...params.query.filters };
  delete filters[params.sourceColumn];
  const relationFilters = (params.query.relationFilters ?? []).filter((relation) => relation.column !== params.sourceColumn);

  const taken = Array.from(new Set(params.takenLiterals.map((literal) => literal.trim()).filter(Boolean)));
  const earlier = params.earlierRules
    .map((rule) => buildNameRuleRelation({ table: params.table, sourceColumn: params.sourceColumn, rule, negate: true }))
    .filter((relation): relation is FilterRelation => relation !== null);

  if (!params.rule.path && taken.length === 0 && earlier.length === 0) {
    filters[params.sourceColumn] = sanitizeNameRuleKey(params.rule.key);
  } else {
    relationFilters.push(positive, ...earlier);
    if (taken.length > 0) filters[params.sourceColumn] = `EXCETO ${taken.join("|")}`;
  }

  return { ...params.query, filters, relationFilters };
}

/** Casamento no client (previa do dialog), mesma semantica do ilike: contem, sem caixa. */
export function nameRuleMatchesText(text: string, key: string): boolean {
  const normalizedKey = sanitizeNameRuleKey(key).toLowerCase();
  if (!normalizedKey) return false;
  return text.toLowerCase().includes(normalizedKey);
}
