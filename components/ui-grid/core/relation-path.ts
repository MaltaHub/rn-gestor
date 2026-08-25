import type { SheetKey } from "@/components/ui-grid/types";
import { getRelationFor, type RelationRef } from "@/components/ui-grid/core/relations";

/**
 * CAMINHO DE EXPANSAO DE FK (recursivo).
 *
 * Uma coluna FK sempre guardou um id. Expandir e trocar esse id por algo legivel
 * da tabela apontada. O problema: a coluna escolhida pode ser ELA MESMA uma FK
 * (`documentos.carro_id` -> `carros.modelo_id` -> `modelos.marca_id` -> ...), e
 * com um unico salto a celula volta a mostrar id cru.
 *
 * Aqui a expansao vira um CAMINHO: uma sequencia de colunas seguidas salto a
 * salto a partir da FK base. Todos os saltos menos o ultimo precisam ser FK; o
 * ultimo e a coluna exibida.
 *
 *   base: documentos.carro_id (FK -> carros.id)
 *   caminho "modelo_id>marca_id>nome"
 *     carros.modelo_id  -> modelos.id
 *     modelos.marca_id  -> marcas.id
 *     marcas.nome       -> valor exibido
 *
 * COMPATIVEL COM O FORMATO ANTIGO: um caminho sem separador ("placa") e um
 * caminho de um salto so — exatamente o que o sistema fazia antes. Nenhuma
 * configuracao salva precisa migrar.
 */

export const RELATION_PATH_SEPARATOR = ">";

/**
 * Teto de saltos. Existe para o caminho ser sempre finito mesmo com FKs que se
 * apontam em ciclo (carros -> modelos -> ... -> carros): a resolucao segue
 * segmentos explicitos, entao o teto e o que impede uma config absurda de virar
 * um lookup gigante em cada linha.
 */
export const MAX_RELATION_PATH_DEPTH = 8;

/** Um salto: sai de `fromTable` seguindo a FK de `column`. */
export type RelationPathHop = {
  fromTable: SheetKey;
  column: string;
  relation: RelationRef;
};

export type ResolvedRelationPath = {
  /** Saltos DEPOIS da FK base (vazio no caminho de um salto so). */
  hops: RelationPathHop[];
  /** Tabela onde a coluna exibida vive. */
  displayTable: SheetKey;
  /** Coluna finalmente mostrada na celula. */
  displayColumn: string;
  /** Toda tabela que precisa estar carregada para a expansao funcionar. */
  tables: SheetKey[];
};

/** Fornecedor de linhas por tabela. Devolve null quando ainda nao carregou. */
export type RelationRowsProvider = (table: SheetKey) => Array<Record<string, unknown>> | null | undefined;

export function parseRelationPath(raw: string): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(RELATION_PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function formatRelationPath(segments: string[]): string {
  return segments.map((segment) => segment.trim()).filter(Boolean).join(RELATION_PATH_SEPARATOR);
}

/** True quando o caminho tem mais de um salto (util so para rotulos na UI). */
export function isMultiHopRelationPath(raw: string): boolean {
  return parseRelationPath(raw).length > 1;
}

/**
 * Resolve o caminho contra o mapa de FKs. Devolve null quando o caminho e
 * invalido (segmento intermediario sem FK, vazio, ou fundo demais) — o chamador
 * entao deixa o valor cru, que e melhor do que mostrar celula vazia.
 */
export function resolveRelationPath(
  baseRelation: RelationRef | null | undefined,
  raw: string
): ResolvedRelationPath | null {
  if (!baseRelation) return null;

  const segments = parseRelationPath(raw);
  if (segments.length === 0 || segments.length > MAX_RELATION_PATH_DEPTH) return null;

  const hops: RelationPathHop[] = [];
  const tables: SheetKey[] = [baseRelation.table];
  let currentTable = baseRelation.table;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const column = segments[index];
    const relation = getRelationFor(currentTable, column);
    // Segmento do meio TEM de ser FK: sem isso nao ha para onde saltar.
    if (!relation) return null;

    hops.push({ fromTable: currentTable, column, relation });
    currentTable = relation.table;
    tables.push(currentTable);
  }

  return {
    hops,
    displayTable: currentTable,
    displayColumn: segments[segments.length - 1],
    tables: Array.from(new Set(tables))
  };
}

/** Tabelas que precisam estar em cache para o caminho renderizar. */
export function collectRelationPathTables(
  baseRelation: RelationRef | null | undefined,
  raw: string
): SheetKey[] {
  if (!baseRelation) return [];
  const resolved = resolveRelationPath(baseRelation, raw);
  // Caminho invalido ainda precisa da tabela base: e dela que sai o proximo
  // nivel de opcoes enquanto o usuario monta o caminho na UI.
  return resolved ? resolved.tables : [baseRelation.table];
}

/**
 * Tabela alcancada depois de seguir `segments` inteiros como FK. E o que a UI
 * usa para saber quais colunas oferecer no proximo nivel do drill-down.
 * Devolve null se algum segmento nao for FK.
 */
export function getRelationPathTargetTable(
  baseRelation: RelationRef | null | undefined,
  segments: string[]
): SheetKey | null {
  if (!baseRelation) return null;
  if (segments.length > MAX_RELATION_PATH_DEPTH) return null;

  let currentTable: SheetKey = baseRelation.table;
  for (const column of segments) {
    const relation = getRelationFor(currentTable, column);
    if (!relation) return null;
    currentTable = relation.table;
  }
  return currentTable;
}

/** Rotulo legivel do caminho: `carros.modelo_id > modelos.nome`. */
export function describeRelationPath(
  baseRelation: RelationRef | null | undefined,
  raw: string
): string {
  const resolved = resolveRelationPath(baseRelation, raw);
  if (!resolved) return raw;

  const parts = resolved.hops.map((hop) => `${hop.fromTable}.${hop.column}`);
  parts.push(`${resolved.displayTable}.${resolved.displayColumn}`);
  return parts.join(` ${RELATION_PATH_SEPARATOR} `);
}

function buildRowIndex(
  rows: Array<Record<string, unknown>>,
  keyColumn: string
): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = row[keyColumn];
    if (key == null) continue;
    const normalized = String(key);
    // Primeira ocorrencia vence, igual ao resto dos lookups do grid.
    if (!index.has(normalized)) index.set(normalized, row);
  }
  return index;
}

/**
 * Monta o mapa `chave da FK base -> valor exibido`, seguindo o caminho inteiro.
 *
 * Devolve null quando falta alguma tabela do caminho no cache: assim o chamador
 * nao instala um mapa pela metade (que apagaria celulas), e a coluna continua
 * mostrando o id cru ate o carregamento terminar.
 *
 * O caminho e percorrido UMA vez por linha da tabela base, com indice por
 * (tabela, coluna-chave) reaproveitado — nao ha busca linear por celula.
 */
export function buildRelationPathLookup(params: {
  baseRelation: RelationRef;
  path: string;
  getRows: RelationRowsProvider;
}): Record<string, unknown> | null {
  const resolved = resolveRelationPath(params.baseRelation, params.path);
  if (!resolved) return null;

  const baseRows = params.getRows(params.baseRelation.table);
  if (!baseRows) return null;

  const indexes = new Map<string, Map<string, Record<string, unknown>>>();
  for (const hop of resolved.hops) {
    const cacheKey = `${hop.relation.table}::${hop.relation.keyColumn}`;
    if (indexes.has(cacheKey)) continue;

    const rows = params.getRows(hop.relation.table);
    if (!rows) return null;
    indexes.set(cacheKey, buildRowIndex(rows, hop.relation.keyColumn));
  }

  const lookup: Record<string, unknown> = {};

  for (const baseRow of baseRows) {
    const baseKey = baseRow[params.baseRelation.keyColumn];
    if (baseKey == null) continue;

    let current: Record<string, unknown> | undefined = baseRow;
    for (const hop of resolved.hops) {
      const nextKey: unknown = current === undefined ? undefined : current[hop.column];
      if (nextKey == null) {
        current = undefined;
        break;
      }
      current = indexes.get(`${hop.relation.table}::${hop.relation.keyColumn}`)?.get(String(nextKey));
      if (!current) break;
    }

    // Elo quebrado: fora do mapa de proposito, para a celula cair no valor cru
    // em vez de ficar vazia.
    if (!current) continue;

    const value = current[resolved.displayColumn];
    if (value === undefined) continue;
    lookup[String(baseKey)] = value;
  }

  return lookup;
}

/**
 * Aplica o caminho a UM valor solto (sem montar mapa). Usado onde ja existe um
 * valor bruto em mao — ex.: o resultado de um PROCH que devolveu outra FK.
 */
export function resolveRelationPathValue(params: {
  rawValue: unknown;
  baseRelation: RelationRef;
  path: string;
  getRows: RelationRowsProvider;
}): unknown {
  if (params.rawValue == null) return params.rawValue;

  const lookup = buildRelationPathLookup({
    baseRelation: params.baseRelation,
    path: params.path,
    getRows: params.getRows
  });
  if (!lookup) return params.rawValue;

  const key = String(params.rawValue);
  return key in lookup ? lookup[key] : params.rawValue;
}
