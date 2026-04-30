import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPlaygroundFeedRows } from "@/components/playground/infra/playground-api";
import { buildRelationDisplayLookup } from "@/components/ui-grid/core/grid-rules";
import {
  buildPlaygroundFeedCellIndex,
  buildPlaygroundFeedDataTargets,
  buildPlaygroundFeedRequestKey,
  buildPlaygroundFeedRequestParams,
  createFeedDataRecordFromPayload,
  stableStringify,
  type PlaygroundFeedDataRecord,
  type PlaygroundFeedDataTarget
} from "@/components/playground/domain/feed-data";
import type { PlaygroundPage } from "@/components/playground/types";
import type { GridListPayload, RequestAuth, SheetKey } from "@/components/ui-grid/types";

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

  useEffect(() => {
    if (targetsRef.current.length === 0) return;
    void refreshTargets(undefined, { force: false });
  }, [authSignature, refreshTargets, targetsSignature]);

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
    () => buildPlaygroundFeedCellIndex(targets, rowsByTargetId, params.page?.cells ?? {}, relationDisplayLookupByTargetId),
    [params.page?.cells, relationDisplayLookupByTargetId, rowsByTargetId, targets]
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
    firstError,
    isRefreshing: refreshingCount > 0,
    refreshAll,
    refreshFeed,
    refreshTargets
  };
}
