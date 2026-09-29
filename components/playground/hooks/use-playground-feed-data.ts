import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllSheetRows } from "@/components/ui-grid/api";
import { fetchPlaygroundFeedRows } from "@/components/playground/infra/playground-api";
import { buildRelationDisplayLookup } from "@/components/ui-grid/core/grid-rules";
import { buildRelationPathLookup, collectRelationPathTables } from "@/components/ui-grid/core/relation-path";
import {
  buildPlaygroundFeedCellIndex,
  buildPlaygroundFeedDataTargets,
  buildPlaygroundFeedRequestKey,
  buildPlaygroundFeedRequestParams,
  buildProchMapKey,
  buildProchValueMap,
  createFeedDataRecordFromPayload,
  expandProchValueMap,
  resolveProchValueRelation,
  stableStringify,
  type PlaygroundFeedDataRecord,
  type PlaygroundFeedDataTarget
} from "@/components/playground/domain/feed-data";
import { filterAnd } from "@/components/ui-grid/core/filter-predicate";
import { mergeResolvedGridFilters, resolveFilterNodeToGridFilters } from "@/components/ui-grid/core/filter-resolve";
import type { PlaygroundPage, PlaygroundProchColumn } from "@/components/playground/types";
import type { GridListPayload, RequestAuth, SheetKey } from "@/components/ui-grid/types";

/** Teto de chaves carregadas ao resolver um filtro aninhado (relacao -> IN). */
const RELATION_KEY_LOOKUP_CAP = 2000;

const MAX_CONCURRENT_FEED_REQUESTS = 3;
const EMPTY_RELATION_CACHE: Partial<Record<SheetKey, GridListPayload>> = {};

type ActiveRequest = {
  controller: AbortController;
  sequence: number;
};

type RefreshOptions = {
  force?: boolean;
};

function buildAuthSignature(requestAuth: RequestAuth) {
  return stableStringify({
    accessToken: requestAuth.accessToken ?? null,
    devRole: requestAuth.devRole ?? null
  });
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Falha ao carregar dados do alimentador.";
}

function pruneRecords(
  records: Record<string, PlaygroundFeedDataRecord>,
  targetIds: Set<string>
): Record<string, PlaygroundFeedDataRecord> {
  return Object.fromEntries(Object.entries(records).filter(([targetId]) => targetIds.has(targetId)));
}

export function usePlaygroundFeedData(params: {
  page: PlaygroundPage | null;
  requestAuth: RequestAuth;
  relationCache?: Partial<Record<SheetKey, GridListPayload>>;
  /** Lazy-load: ids dos alvos visiveis na viewport. undefined = carrega todos
   *  (fallback). Carregamento e MONOTONICO: uma vez visivel/carregado, fica em
   *  cache — o conjunto so cresce, entao nunca oscila (load -> resize -> load). */
  visibleTargetIds?: string[];
}) {
  const relationCache = params.relationCache ?? EMPTY_RELATION_CACHE;
  const targets = useMemo(() => buildPlaygroundFeedDataTargets(params.page?.feeds ?? []), [params.page?.feeds]);
  const targetsSignature = useMemo(
    () => targets.map((target) => `${target.id}:${buildPlaygroundFeedRequestKey(target)}`).join("\n"),
    [targets]
  );
  const authSignature = useMemo(() => buildAuthSignature(params.requestAuth), [params.requestAuth]);
  const targetsRef = useRef<PlaygroundFeedDataTarget[]>(targets);
  const requestAuthRef = useRef(params.requestAuth);
  const cacheRef = useRef(new Map<string, GridListPayload>());
  const activeRequestsRef = useRef(new Map<string, ActiveRequest>());
  const requestSequenceRef = useRef(0);

  const [recordsByTargetId, setRecordsByTargetId] = useState<Record<string, PlaygroundFeedDataRecord>>({});
  const [refreshingCount, setRefreshingCount] = useState(0);
  const [prochValueMaps, setProchValueMaps] = useState<Record<string, Map<string, unknown>>>({});
  // Cache de linhas brutas POR TABELA. Chave so a tabela: um caminho de
  // expansao pode visitar a mesma tabela por colunas diferentes, e assim ela e
  // baixada uma vez so.
  const prochRowsCacheRef = useRef(new Map<string, Array<Record<string, unknown>>>());
  const prochInFlightRef = useRef(new Map<string, Promise<Array<Record<string, unknown>>>>());

  targetsRef.current = targets;
  requestAuthRef.current = params.requestAuth;

  useEffect(() => {
    cacheRef.current.clear();
  }, [authSignature]);

  useEffect(() => {
    const targetIds = new Set(targets.map((target) => target.id));

    for (const [targetId, request] of activeRequestsRef.current.entries()) {
      if (!targetIds.has(targetId)) {
        request.controller.abort();
        activeRequestsRef.current.delete(targetId);
      }
    }

    setRecordsByTargetId((current) => pruneRecords(current, targetIds));
  }, [targets, targetsSignature]);

  useEffect(() => {
    const activeRequests = activeRequestsRef.current;

    return () => {
      for (const request of activeRequests.values()) {
        request.controller.abort();
      }
      activeRequests.clear();
    };
  }, []);

  const loadTarget = useCallback(async (target: PlaygroundFeedDataTarget, options?: RefreshOptions) => {
    const requestKey = buildPlaygroundFeedRequestKey(target);
    const cachedPayload = options?.force ? null : cacheRef.current.get(requestKey) ?? null;

    if (cachedPayload) {
      const record = createFeedDataRecordFromPayload(target, requestKey, cachedPayload);
      setRecordsByTargetId((current) => ({
        ...current,
        [target.id]: record
      }));
      return record;
    }

    const previousRequest = activeRequestsRef.current.get(target.id);
    previousRequest?.controller.abort();

    const controller = new AbortController();
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    activeRequestsRef.current.set(target.id, { controller, sequence });

    setRecordsByTargetId((current) => {
      const previous = current[target.id];
      return {
        ...current,
        [target.id]: {
          targetId: target.id,
          requestKey,
          rows: previous?.requestKey === requestKey ? previous.rows : [],
          totalRows: previous?.requestKey === requestKey ? previous.totalRows : 0,
          status: "loading",
          loadedAt: previous?.requestKey === requestKey ? previous.loadedAt : undefined
        }
      };
    });
    setRefreshingCount((count) => count + 1);

    try {
      const requestParams = buildPlaygroundFeedRequestParams(target);

      // Resolve filtros aninhados (cross-tabela) no client: cada relacao vira uma
      // condicao IN na coluna local, via subconsulta na tabela relacionada.
      const relationFilters = target.query.relationFilters ?? [];
      if (relationFilters.length > 0) {
        const resolved = await resolveFilterNodeToGridFilters(filterAnd(...relationFilters), async ({ table, filters, keyColumn }) => {
          // Paginado ate o teto: o servidor clampa pageSize em 200, entao pedir
          // RELATION_KEY_LOOKUP_CAP numa chamada so cortava a lista de chaves em
          // 200 — o IN saia incompleto e o alimentador perdia linhas em silencio.
          const sub = await fetchAllSheetRows({
            table,
            requestAuth: requestAuthRef.current,
            filters,
            maxRows: RELATION_KEY_LOOKUP_CAP,
            signal: controller.signal
          });
          const keys: string[] = [];
          for (const row of sub.rows) {
            const value = row[keyColumn];
            if (value != null) keys.push(String(value));
          }
          return { keys, truncated: sub.totalRows > sub.rows.length };
        });
        // Mescla (nao sobrescreve): EXCETO de fragmento por valor + por nome somam.
        requestParams.filters = mergeResolvedGridFilters(requestParams.filters, resolved.filters);
      }

      const payload = await fetchPlaygroundFeedRows({
        ...requestParams,
        requestAuth: requestAuthRef.current,
        signal: controller.signal
      });

      if (activeRequestsRef.current.get(target.id)?.sequence !== sequence) {
        return null;
      }

      cacheRef.current.set(requestKey, payload);
      const record = createFeedDataRecordFromPayload(target, requestKey, payload);
      setRecordsByTargetId((current) => ({
        ...current,
        [target.id]: record
      }));
      return record;
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }

      if (activeRequestsRef.current.get(target.id)?.sequence === sequence) {
        setRecordsByTargetId((current) => {
          const previous = current[target.id];
          return {
            ...current,
            [target.id]: {
              targetId: target.id,
              requestKey,
              rows: previous?.rows ?? [],
              totalRows: previous?.totalRows ?? 0,
              status: "error",
              loadedAt: previous?.loadedAt,
              error: buildErrorMessage(error)
            }
          };
        });
      }

      return null;
    } finally {
      if (activeRequestsRef.current.get(target.id)?.sequence === sequence) {
        activeRequestsRef.current.delete(target.id);
      }
      setRefreshingCount((count) => Math.max(0, count - 1));
    }
  }, []);

  const refreshTargets = useCallback(
    async (ids?: string[], options?: RefreshOptions) => {
      const idSet = ids ? new Set(ids) : null;
      const selectedTargets = targetsRef.current.filter(
        (target) => !idSet || idSet.has(target.id) || idSet.has(target.feedId)
      );
      const queue = selectedTargets.slice();
      const workerCount = Math.min(MAX_CONCURRENT_FEED_REQUESTS, queue.length);
      const loadedRecords: PlaygroundFeedDataRecord[] = [];

      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (queue.length > 0) {
            const target = queue.shift();
            if (target) {
              const record = await loadTarget(target, options);
              if (record) {
                loadedRecords.push(record);
              }
            }
          }
        })
      );

      return loadedRecords;
    },
    [loadTarget]
  );

  // Lazy-load MONOTONICO: carrega so os alvos visiveis que ainda nao foram
  // pedidos. requestedIdsRef guarda o que ja foi pedido (nunca "descarrega"),
  // entao o conjunto so cresce -> converge, sem o loop load->resize->load.
  const requestedIdsRef = useRef<Set<string>>(new Set());
  const visibleSignature = params.visibleTargetIds ? [...params.visibleTargetIds].sort().join("|") : null;

  // Reseta o conjunto pedido quando a sessao ou os alvos (pagina) mudam — ai
  // tudo precisa recarregar (o cache tambem foi limpo no effect de authSignature).
  useEffect(() => {
    requestedIdsRef.current = new Set();
  }, [authSignature, targetsSignature]);

  useEffect(() => {
    if (targetsRef.current.length === 0) return;
    // Sem sinal de visibilidade (undefined) => fallback: carrega todos.
    const visible = params.visibleTargetIds ?? targetsRef.current.map((target) => target.id);
    const toLoad = visible.filter((id) => !requestedIdsRef.current.has(id));
    if (toLoad.length === 0) return;
    for (const id of toLoad) requestedIdsRef.current.add(id);
    void refreshTargets(toLoad, { force: false });
    // visibleSignature (string) evita refetch por nova identidade de array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSignature, refreshTargets, targetsSignature, visibleSignature]);

  // ---- PROCH: coleta colunas unicas, carrega tabela alvo, indexa Map<chave, valor>.
  const prochColumns = useMemo(() => {
    const seen = new Map<string, PlaygroundProchColumn>();
    for (const target of targets) {
      for (const column of target.prochColumns) {
        seen.set(buildProchMapKey(column), column);
      }
    }
    return Array.from(seen.values());
  }, [targets]);

  const prochSignature = useMemo(
    () => prochColumns.map((column) => buildProchMapKey(column)).sort().join("|"),
    [prochColumns]
  );

  useEffect(() => {
    // Limpa o cache (rows + maps) quando a sessao muda.
    prochRowsCacheRef.current.clear();
    prochInFlightRef.current.clear();
    setProchValueMaps({});
  }, [authSignature]);

  useEffect(() => {
    if (prochColumns.length === 0) {
      setProchValueMaps((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    let cancelled = false;

    /**
     * Linhas COMPLETAS de uma tabela, deduplicadas por tabela. A chave de cache
     * e so a tabela (nao a coluna-chave) porque um caminho de expansao pode
     * visitar a mesma tabela por colunas diferentes — sem isso, um caminho longo
     * baixaria a mesma tabela varias vezes.
     */
    async function ensureTableRows(table: SheetKey, sortColumn?: string) {
      const cached = prochRowsCacheRef.current.get(table);
      if (cached) return cached;
      const inFlight = prochInFlightRef.current.get(table);
      if (inFlight) return inFlight;

      const promise = (async () => {
        // Dominio COMPLETO (paginado): o PROCH so acha a chave se o mapa tiver
        // TODAS as linhas da tabela alvo. Pedir um pageSize gigante nao resolvia
        // — o servidor clampa e as linhas de fora do primeiro lote nunca casavam.
        const payload = await fetchAllSheetRows({
          table,
          requestAuth: requestAuthRef.current,
          sort: sortColumn ? [{ column: sortColumn, dir: "asc" }] : []
        });
        prochRowsCacheRef.current.set(table, payload.rows);
        prochInFlightRef.current.delete(table);
        return payload.rows;
      })().catch((error) => {
        prochInFlightRef.current.delete(table);
        throw error;
      });

      prochInFlightRef.current.set(table, promise);
      return promise;
    }

    (async () => {
      const nextMaps: Record<string, Map<string, unknown>> = {};
      await Promise.all(
        prochColumns.map(async (column) => {
          try {
            const rows = await ensureTableRows(column.lookupTable, column.lookupKeyColumn);
            const valueMap = buildProchValueMap(rows, column.lookupKeyColumn, column.lookupValueColumn);

            // Expansao do resultado: quando o PROCH devolve outra FK, o valor e
            // um id. O caminho pode ter QUANTOS SALTOS forem precisos — o mesmo
            // motor usado pelas colunas do grid (core/relation-path).
            const relation = resolveProchValueRelation(column);
            const path = column.lookupValueDisplayColumn;
            if (!relation || !path) {
              nextMaps[buildProchMapKey(column)] = valueMap;
              return;
            }

            // Carrega TODAS as tabelas do caminho antes de montar o mapa: o
            // motor e sincrono e precisa achar cada salto ja em memoria.
            const rowsByTable = new Map<SheetKey, Array<Record<string, unknown>>>();
            await Promise.all(
              collectRelationPathTables(relation, path).map(async (pathTable) => {
                rowsByTable.set(pathTable, await ensureTableRows(pathTable));
              })
            );

            const labelByKey = buildRelationPathLookup({
              baseRelation: relation,
              path,
              getRows: (pathTable) => rowsByTable.get(pathTable) ?? null
            });

            nextMaps[buildProchMapKey(column)] = labelByKey
              ? expandProchValueMap(valueMap, labelByKey)
              : valueMap;
          } catch {
            nextMaps[buildProchMapKey(column)] = new Map();
          }
        })
      );
      if (cancelled) return;
      setProchValueMaps(nextMaps);
    })();

    return () => {
      cancelled = true;
    };
  }, [prochSignature, prochColumns]);

  const rowsByTargetId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(recordsByTargetId).map(([targetId, record]) => [targetId, record.rows])
      ) as Record<string, Array<Record<string, unknown>>>,
    [recordsByTargetId]
  );
  const relationDisplayLookupByTargetId = useMemo(
    () =>
      Object.fromEntries(
        targets.map((target) => [
          target.id,
          buildRelationDisplayLookup(target.table, target.displayColumnOverrides, relationCache)
        ])
      ) as Record<string, Record<string, Record<string, unknown>>>,
    [relationCache, targets]
  );

  const displayCells = useMemo(
    () =>
      buildPlaygroundFeedCellIndex(
        targets,
        rowsByTargetId,
        params.page?.cells ?? {},
        relationDisplayLookupByTargetId,
        prochValueMaps
      ),
    [params.page?.cells, prochValueMaps, relationDisplayLookupByTargetId, rowsByTargetId, targets]
  );
  const firstError = useMemo(
    () => Object.values(recordsByTargetId).find((record) => record.status === "error")?.error ?? null,
    [recordsByTargetId]
  );
  const refreshAll = useCallback(
    (options?: RefreshOptions) => refreshTargets(undefined, { force: true, ...options }),
    [refreshTargets]
  );
  const refreshFeed = useCallback(
    (feedId: string, options?: RefreshOptions) => refreshTargets([feedId], { force: true, ...options }),
    [refreshTargets]
  );

  return {
    targets,
    recordsByTargetId,
    displayCells,
    relationDisplayLookupByTargetId,
    firstError,
    isRefreshing: refreshingCount > 0,
    refreshAll,
    refreshFeed,
    refreshTargets
  };
}
