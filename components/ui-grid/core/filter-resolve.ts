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

    // 3) achata na coluna local como condicao IN (ou sentinela de "vazio").
    if (result.keys.length === 0) {
      filters[relation.column] = RELATION_NO_MATCH_LITERAL;
    } else {
      filters[relation.column] = dedupeKeys(result.keys).join("|");
    }
  }

  return { filters, truncated };
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
