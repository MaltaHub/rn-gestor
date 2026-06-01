import type { GridFilters, SheetKey } from "@/components/ui-grid/types";

/**
 * Modelo de filtro em ARVORE DE PREDICADOS (fundacao da reforma de filtros).
 *
 * Hoje os filtros sao um DSL string por coluna (GridFilters = Record<col, expr>),
 * avaliado no servidor por applyGridFilters (=, >=, a|b|c -> IN, EXCETO, VAZIO...).
 * Esse modelo generaliza isso para uma arvore composavel que suporta:
 *  - folha: um predicado de coluna (reaproveita o DSL string existente);
 *  - relacao: aninhamento cross-tabela ("este valor deve casar uma PK de outra
 *    tabela que satisfaz <sub-predicado>") — recursivo em qualquer profundidade;
 *  - grupo: AND/OR de filhos.
 *
 * A recursao vive AQUI (nos dados), nao na UI. A avaliacao das relacoes acontece
 * no servidor (fase seguinte): cada relacao vira um subquery/`.in(...)`. Esta
 * fase entrega so o modelo + helpers puros + a ponte com o GridFilters legado.
 */

export type FilterLeaf = {
  kind: "leaf";
  column: string;
  /** Expressao no DSL existente (=valor, >=n, a|b|c, EXCETO a|b, VAZIO, !VAZIO, texto). */
  expression: string;
};

export type FilterRelation = {
  kind: "relation";
  /** Coluna local cujo valor precisa casar uma chave da tabela relacionada. */
  column: string;
  /** Tabela relacionada onde o sub-predicado e avaliado. */
  table: SheetKey;
  /** Coluna-chave (PK/FK) da tabela relacionada que casa com `column`. */
  keyColumn: string;
  /** Sub-predicado aplicado a tabela relacionada (recursivo). */
  where: FilterNode;
};

export type FilterGroup = {
  kind: "group";
  op: "and" | "or";
  children: FilterNode[];
};

export type FilterNode = FilterLeaf | FilterRelation | FilterGroup;

export function filterLeaf(column: string, expression: string): FilterLeaf {
  return { kind: "leaf", column, expression };
}

export function filterRelation(params: {
  column: string;
  table: SheetKey;
  keyColumn: string;
  where: FilterNode;
}): FilterRelation {
  return { kind: "relation", column: params.column, table: params.table, keyColumn: params.keyColumn, where: params.where };
}

export function filterAnd(...children: FilterNode[]): FilterGroup {
  return { kind: "group", op: "and", children };
}

export function filterOr(...children: FilterNode[]): FilterGroup {
  return { kind: "group", op: "or", children };
}

/** Uma folha so "conta" se tiver coluna e expressao nao-vazia. */
function isMeaningfulLeaf(node: FilterLeaf): boolean {
  return node.column.trim().length > 0 && node.expression.trim().length > 0;
}

/**
 * Normaliza a arvore: remove folhas vazias, grupos vazios e achata grupos de um
 * filho so / grupos do mesmo operador aninhados. Retorna null se nada sobrar.
 */
export function normalizeFilterNode(node: FilterNode): FilterNode | null {
  if (node.kind === "leaf") {
    return isMeaningfulLeaf(node) ? node : null;
  }

  if (node.kind === "relation") {
    const where = normalizeFilterNode(node.where);
    // Relacao sem sub-predicado nao restringe nada -> descarta.
    if (!where) return null;
    return { ...node, where };
  }

  const children: FilterNode[] = [];
  for (const child of node.children) {
    const normalized = normalizeFilterNode(child);
    if (!normalized) continue;
    // Achata grupo de mesmo operador.
    if (normalized.kind === "group" && normalized.op === node.op) {
      children.push(...normalized.children);
    } else {
      children.push(normalized);
    }
  }

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { kind: "group", op: node.op, children };
}

export type ConjunctionSplit = {
  /** Folhas diretamente aplicaveis a tabela (mapeadas para o GridFilters legado). */
  leafFilters: GridFilters;
  /** Predicados de relacao a resolver via subquery no servidor. */
  relations: FilterRelation[];
  /**
   * true quando a arvore eh um AND puro de folhas/relacoes (caso suportado pelo
   * pipeline atual). OR/aninhamento de grupos ainda nao mapeiam para GridFilters
   * (Record por coluna), entao ficam marcados como nao suportados ate a fase de
   * avaliacao no servidor cobrir disjuncao.
   */
  supported: boolean;
};

/**
 * Quebra um predicado (assumindo semantica de conjuncao no topo) em:
 *  - leafFilters: o Record<coluna, expressao> aplicavel hoje;
 *  - relations: as relacoes cross-tabela a resolver no servidor.
 * Marca supported=false se encontrar OR (nao representavel no GridFilters atual).
 */
export function splitConjunction(node: FilterNode | null): ConjunctionSplit {
  const leafFilters: GridFilters = {};
  const relations: FilterRelation[] = [];
  let supported = true;

  const walk = (current: FilterNode) => {
    if (current.kind === "leaf") {
      if (isMeaningfulLeaf(current)) leafFilters[current.column] = current.expression.trim();
      return;
    }
    if (current.kind === "relation") {
      relations.push(current);
      return;
    }
    if (current.op === "or") {
      supported = false;
      return;
    }
    for (const child of current.children) walk(child);
  };

  if (node) walk(node);

  return { leafFilters, relations, supported };
}

/** Converte o GridFilters legado em um AND de folhas (compat retroativa). */
export function fromGridFilters(filters: GridFilters): FilterGroup {
  return {
    kind: "group",
    op: "and",
    children: Object.entries(filters)
      .filter(([, expression]) => expression.trim().length > 0)
      .map(([column, expression]) => filterLeaf(column, expression))
  };
}

/** Atalho: extrai apenas o GridFilters diretamente aplicavel de uma arvore. */
export function toGridFilters(node: FilterNode | null): GridFilters {
  return splitConjunction(node).leafFilters;
}

export type DescribeLabels = {
  column?: (column: string) => string;
  table?: (table: SheetKey) => string;
  expression?: (column: string, expression: string) => string;
};

/** Descricao legivel da arvore (para tooltip/resumo). Recursiva nas relacoes. */
export function describeFilterNode(node: FilterNode | null, labels: DescribeLabels = {}): string {
  if (!node) return "Sem filtro";

  const columnLabel = (column: string) => labels.column?.(column) ?? column;
  const tableLabel = (table: SheetKey) => labels.table?.(table) ?? table;

  if (node.kind === "leaf") {
    const expr = labels.expression?.(node.column, node.expression) ?? node.expression;
    return `${columnLabel(node.column)}: ${expr}`;
  }

  if (node.kind === "relation") {
    return `${columnLabel(node.column)} em ${tableLabel(node.table)} onde (${describeFilterNode(node.where, labels)})`;
  }

  const joiner = node.op === "and" ? " E " : " OU ";
  return node.children.map((child) => describeFilterNode(child, labels)).join(joiner);
}
