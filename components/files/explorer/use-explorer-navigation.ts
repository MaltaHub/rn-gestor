import { useCallback, useEffect, useRef, useState } from "react";

import type { ExplorerModel } from "@/components/files/explorer/model";

const LAST_FOLDER_KEY = "rn-gestor.files.lastFolderId";

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function readInitialFolderId(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = readParam("pasta");
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(LAST_FOLDER_KEY);
  } catch {
    return null;
  }
}

type HistoryState = { stack: Array<string | null>; cursor: number };

/**
 * Pasta atual + histórico Voltar/Avançar (como o Explorer). Trocar de pasta é
 * só estado local — nenhuma requisição. A URL acompanha (`?pasta=`) via
 * replaceState, sem acionar o roteador.
 */
export function useExplorerNavigation(model: ExplorerModel | null) {
  const [history, setHistory] = useState<HistoryState>(() => ({ stack: [readInitialFolderId()], cursor: 0 }));
  const currentFolderId = history.stack[history.cursor] ?? null;
  // Deep-link `?carro=<id>` (atalhos do form do grid): lido JÁ na montagem — o
  // efeito que sincroniza a URL apaga o parâmetro assim que o índice chega.
  const [deepLinkCarroId] = useState(() => readParam("carro"));
  const deepLinkDoneRef = useRef(false);

  const navigate = useCallback((folderId: string | null) => {
    setHistory((state) => {
      if (state.stack[state.cursor] === folderId) return state;
      const stack = [...state.stack.slice(0, state.cursor + 1), folderId].slice(-100);
      return { stack, cursor: stack.length - 1 };
    });
  }, []);

  const back = useCallback(() => {
    setHistory((state) => (state.cursor > 0 ? { ...state, cursor: state.cursor - 1 } : state));
  }, []);

  const forward = useCallback(() => {
    setHistory((state) => (state.cursor < state.stack.length - 1 ? { ...state, cursor: state.cursor + 1 } : state));
  }, []);

  const parentId = currentFolderId && model ? (model.foldersById.get(currentFolderId)?.parentId ?? null) : null;

  const up = useCallback(() => {
    if (currentFolderId) navigate(parentId && model?.foldersById.has(parentId) ? parentId : null);
  }, [currentFolderId, model, navigate, parentId]);

  // `?carro=` vence a última pasta lembrada: abre a pasta de documentos do veículo.
  useEffect(() => {
    if (!model || deepLinkDoneRef.current) return;
    deepLinkDoneRef.current = true;
    if (!deepLinkCarroId) return;
    for (const folder of model.foldersById.values()) {
      if (folder.automationKey === "vehicle_documents" && folder.managedCarroId === deepLinkCarroId) {
        setHistory({ stack: [folder.id], cursor: 0 });
        return;
      }
    }
  }, [deepLinkCarroId, model]);

  // Pasta sumiu (excluída por alguém / link velho): cai na raiz sem empilhar.
  useEffect(() => {
    if (!model || !currentFolderId || model.foldersById.has(currentFolderId)) return;
    setHistory((state) => {
      const stack = [...state.stack];
      stack[state.cursor] = null;
      return { ...state, stack };
    });
  }, [currentFolderId, model]);

  useEffect(() => {
    if (typeof window === "undefined" || !model) return;
    const url = new URL(window.location.href);
    if (currentFolderId) url.searchParams.set("pasta", currentFolderId);
    else url.searchParams.delete("pasta");
    url.searchParams.delete("carro");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
    try {
      if (currentFolderId) window.localStorage.setItem(LAST_FOLDER_KEY, currentFolderId);
      else window.localStorage.removeItem(LAST_FOLDER_KEY);
    } catch {
      // storage bloqueado: só não lembra a última pasta.
    }
  }, [currentFolderId, model]);

  return {
    currentFolderId,
    navigate,
    back,
    forward,
    up,
    canBack: history.cursor > 0,
    canForward: history.cursor < history.stack.length - 1,
    canUp: Boolean(currentFolderId)
  };
}
