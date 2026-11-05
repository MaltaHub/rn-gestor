"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from "react";

import dynamic from "next/dynamic";

import { matchDocumentType } from "@/components/files/document-slots";
import { AutomationSettingsDialog } from "@/components/files/explorer/automation-settings-dialog";
import { AddressSkeleton, ExplorerAddressBar, type SearchScope } from "@/components/files/explorer/explorer-address-bar";
import { ExplorerCommandBar, VIEW_MODE_LABELS, type CommandAction, type ViewMode } from "@/components/files/explorer/explorer-command-bar";
import { ExplorerContent, type SearchLocation } from "@/components/files/explorer/explorer-content";
import { ExplorerDetailsPane } from "@/components/files/explorer/explorer-details-pane";
import { ExplorerIssues } from "@/components/files/explorer/explorer-issues";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { ConfirmDialog, ContextMenu, FileViewer, MoveDialog, type MenuItem } from "@/components/files/explorer/explorer-overlays";
import { ExplorerTree } from "@/components/files/explorer/explorer-tree";
import styles from "@/components/files/explorer/explorer.module.css";
import { canDeleteFolder, canRenameFolder, folderKind, isFolderLocked } from "@/components/files/explorer/folder-rules";
import {
  folderKey,
  folderLabel,
  getFolderFiles,
  getFolderPath,
  listFolderEntries,
  parseEntryKey,
  reorderFileIds,
  searchExplorer,
  sortEntries,
  uniqueChildFolderName,
  upsertIndexFiles,
  type EntryKey,
  type ExplorerEntry,
  type SortKey
} from "@/components/files/explorer/model";
import { signedUrlStore } from "@/components/files/explorer/signed-url-store";
import { useExplorerActions } from "@/components/files/explorer/use-explorer-actions";
import { useExplorerDnd } from "@/components/files/explorer/use-explorer-dnd";
import { useExplorerIndex } from "@/components/files/explorer/use-explorer-index";
import { useExplorerNavigation } from "@/components/files/explorer/use-explorer-navigation";
import { useExplorerPrefs, type PrefKind } from "@/components/files/explorer/use-explorer-prefs";
import { useExplorerSelection } from "@/components/files/explorer/use-explorer-selection";
import { useScrollMemory } from "@/components/files/explorer/use-scroll-memory";
import { summarizeUploads, useUploadQueue } from "@/components/files/explorer/use-upload-queue";
import { useUploadRouter } from "@/components/files/explorer/use-upload-router";
import { activeTemplateFor } from "@/components/files/ocr/use-ocr";
import type { OcrTemplateSummary } from "@/lib/domain/ocr/types";
import type { CurrentActor, RequestAuth, Role } from "@/components/ui-grid/types";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import type { ExplorerFile } from "@/lib/files/explorer-types";
import { formatBytes } from "@/lib/files/shared";

type FileManagerWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

type Notice = { id: number; kind: "info" | "error"; text: string };
type ConfirmState = { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };

const SEARCH_LIMIT = 300;

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

const LAST_PATH_KEY = "rn-gestor.files.lastPath.v1";
const TREE_EXPANDED_KEY = "rn-gestor.files.treeExpanded.v1";

// Console pesado (pdf.js/tesseract sob demanda): só carrega quando aberto.
const OcrConsole = dynamic(() => import("@/components/files/ocr/ocr-console").then((module) => module.OcrConsole), {
  ssr: false,
  loading: () => <div style={{ padding: 24 }}>Abrindo o console de OCR…</div>
});

export function FileManagerWorkspace({ actor, accessToken, devRole }: FileManagerWorkspaceProps) {
  const auth = useMemo<RequestAuth>(() => ({ accessToken, devRole: devRole ?? undefined }), [accessToken, devRole]);
  // Configurado no render (idempotente): os filhos pedem URLs nos efeitos deles, que rodam antes dos do pai.
  signedUrlStore.configure(auth);
  const canManage = actor.role === "ADMINISTRADOR";

  // ------------------------------------------------------------- avisos
  const [notices, setNotices] = useState<Notice[]>([]);
  const noticeIdRef = useRef(0);
  const notify = useCallback((kind: Notice["kind"], text: string) => {
    noticeIdRef.current += 1;
    const id = noticeIdRef.current;
    setNotices((current) => [...current.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), kind === "error" ? 9000 : 3500);
  }, []);

  // ------------------------------------------------------------- dados
  const indexApi = useExplorerIndex(auth);
  const { model } = indexApi;
  const nav = useExplorerNavigation(model);
  const { currentFolderId } = nav;
  const currentFolder = (currentFolderId && model?.foldersById.get(currentFolderId)) || null;

  // Deep-link `/arquivos?carro=<id>` (atalho do form do grid): pasta de documentos do veículo.
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (!model || deepLinkDoneRef.current) return;
    deepLinkDoneRef.current = true;
    const carroId = new URLSearchParams(window.location.search).get("carro");
    if (!carroId) return;
    const docs = Array.from(model.foldersById.values()).find(
      (folder) => folder.automationKey === "vehicle_documents" && folder.managedCarroId === carroId
    );
    if (docs) nav.navigate(docs.id);
  }, [model, nav]);

  // ------------------------------------------------------------- busca
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [scope, setScope] = useState<SearchScope>("all");
  const [showAllResults, setShowAllResults] = useState(false);
  const searching = deferredQuery.trim().length > 0;
  useEffect(() => setShowAllResults(false), [deferredQuery]);

  const searchResult = useMemo(() => {
    if (!model || !searching) return null;
    return searchExplorer(model, deferredQuery, {
      scopeFolderId: scope === "folder" ? currentFolderId : null,
      limit: showAllResults ? undefined : SEARCH_LIMIT
    });
  }, [currentFolderId, deferredQuery, model, scope, searching, showAllResults]);

  // ------------------------------------------------------- preferências
  const prefsApi = useExplorerPrefs();
  // Em tela estreita o painel de detalhes é uma gaveta: começa fechado e não herda a preferência do desktop.
  const isNarrow = useMediaQuery("(max-width: 1100px)");
  const [narrowDetailsOpen, setNarrowDetailsOpen] = useState(false);
  const detailsOpen = isNarrow ? narrowDetailsOpen : prefsApi.prefs.detailsPane;
  const setDetailsOpen = useCallback(
    (open: boolean) => (isNarrow ? setNarrowDetailsOpen(open) : prefsApi.setDetailsPane(open)),
    [isNarrow, prefsApi]
  );
  const toggleDetails = useCallback(() => setDetailsOpen(!detailsOpen), [detailsOpen, setDetailsOpen]);
  const prefKind: PrefKind = searching ? "search" : !currentFolder ? "root" : folderKind(currentFolder);
  const viewMode = prefsApi.prefs.views[prefKind];
  const sort = prefsApi.prefs.sorts[prefKind];
  const sortOptions: SortKey[] = currentFolderId && !searching ? ["name", "modified", "type", "size", "order"] : ["name", "modified", "type", "size"];
  const effectiveSortKey = sortOptions.includes(sort.key) ? sort.key : "name";

  const entries = useMemo<ExplorerEntry[]>(() => {
    if (!model) return [];
    if (searchResult) return searchResult.hits.map((hit) => hit.entry);
    return sortEntries(listFolderEntries(model, currentFolderId), effectiveSortKey, sort.direction);
  }, [currentFolderId, effectiveSortKey, model, searchResult, sort.direction]);

  const locations = useMemo(
    () =>
      searchResult
        ? new Map<EntryKey, SearchLocation>(searchResult.hits.map((hit) => [hit.entry.key, { label: hit.location, folderId: hit.locationFolderId }]))
        : null,
    [searchResult]
  );

  const orderedKeys = useMemo(() => entries.map((entry) => entry.key), [entries]);
  const selection = useExplorerSelection(orderedKeys);
  const selectedEntries = useMemo(() => entries.filter((entry) => selection.selected.has(entry.key)), [entries, selection.selected]);
  const entryByKey = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);

  // ---------------------------------------------------------- uploads
  const uploads = useUploadQueue({
    auth,
    onUploaded: (folderId, files) => {
      indexApi.update((current) => upsertIndexFiles(current, files));
      indexApi.scheduleRevalidate();
      void folderId;
    },
    onError: (message) => notify("error", message)
  });
  const router = useUploadRouter({ auth, model, enqueue: uploads.enqueue, notify, ocrEnabled: canManage });
  const actions = useExplorerActions({ auth, model, indexApi, notify });
  const uploadSummary = summarizeUploads(uploads.items);
  const folderUploads = useMemo(
    () => (searching ? [] : uploads.items.filter((item) => item.folderId === currentFolderId && item.status !== "done")),
    [currentFolderId, searching, uploads.items]
  );

  // ------------------------------------------------------------ estado UI
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [renamingKey, setRenamingKey] = useState<EntryKey | null>(null);
  const [pendingFolderName, setPendingFolderName] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<EntryKey[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [moveRequest, setMoveRequest] = useState<EntryKey[] | null>(null);
  const [viewer, setViewer] = useState<{ files: ExplorerFile[]; index: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ocrConsoleOpen, setOcrConsoleOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const canSeeIssues = actor.role === "ADMINISTRADOR" || actor.role === "GERENTE";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const navPaneRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Navegar (clique) e selecionar são modos separados: só há seleção ativa
  // quando o usuário pede (Selecionar / caixa / Ctrl / Shift).
  const [selectionMode, setSelectionMode] = useState(false);
  const selecting = selectionMode || selection.selected.size > 0;
  const lastNavigationAtRef = useRef(0);
  const { setFocus } = selection;

  useScrollMemory(contentRef, `${searching ? "search" : (currentFolderId ?? "root")}:${viewMode}`, Boolean(model));
  useScrollMemory(navPaneRef, "tree", Boolean(model));

  // Ao subir/voltar, destaca a subpasta de onde o usuário veio.
  const previousFolderIdRef = useRef<string | null>(currentFolderId);
  useEffect(() => {
    const previous = previousFolderIdRef.current;
    if (previous === currentFolderId) return;
    previousFolderIdRef.current = currentFolderId;
    lastNavigationAtRef.current = Date.now();
    if (model && previous && (model.foldersById.get(previous)?.parentId ?? null) === currentFolderId) {
      setFocus(folderKey(previous));
    }
  }, [currentFolderId, model, setFocus]);

  // Último caminho aberto: o cabeçalho já nasce nele, antes do índice chegar.
  const [storedPath, setStoredPath] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    try {
      setStoredPath(JSON.parse(window.localStorage.getItem(LAST_PATH_KEY) ?? "[]"));
    } catch {
      setStoredPath([]);
    }
  }, []);
  useEffect(() => {
    if (!model) return;
    const path = getFolderPath(model, currentFolderId).map((folder) => ({ id: folder.id, label: folderLabel(folder) }));
    try {
      window.localStorage.setItem(LAST_PATH_KEY, JSON.stringify(path));
    } catch {
      // sem storage: só não lembra o caminho.
    }
  }, [currentFolderId, model]);

  // Árvore: expansão SÓ manual (pedido do Kaic), lembrada entre sessões.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(TREE_EXPANDED_KEY) ?? "[]") as string[];
      if (Array.isArray(saved)) setExpanded(new Set(saved));
    } catch {
      // ignora storage corrompido
    }
  }, []);
  const updateExpanded = useCallback((next: (current: Set<string>) => Set<string>) => {
    setExpanded((current) => {
      const value = next(current);
      try {
        window.localStorage.setItem(TREE_EXPANDED_KEY, JSON.stringify(Array.from(value)));
      } catch {
        // sem storage: vale só na sessão
      }
      return value;
    });
  }, []);
  const revealCurrentInTree = useCallback(() => {
    if (!model || !currentFolderId) return;
    const ancestors = getFolderPath(model, currentFolderId).map((folder) => folder.id);
    updateExpanded((current) => new Set([...current, ...ancestors]));
  }, [currentFolderId, model, updateExpanded]);

  // Trocar de pasta encerra edição pendente e fecha a gaveta no celular.
  useEffect(() => {
    setRenamingKey(null);
    setPendingFolderName(null);
    setMobileTreeOpen(false);
    setSelectionMode(false);
  }, [currentFolderId]);

  const cutKeys = useMemo(() => new Set(clipboard ?? []), [clipboard]);

  const navigate = useCallback(
    (folderId: string | null) => {
      setQuery("");
      nav.navigate(folderId);
      contentRef.current?.focus({ preventScroll: true });
    },
    [nav]
  );

  // ------------------------------------------------------------ operações
  const openEntry = useCallback(
    (entry: ExplorerEntry) => {
      if (entry.kind === "folder") {
        navigate(entry.id);
        return;
      }
      const files = entries.filter((item) => item.kind === "file").map((item) => (item.kind === "file" ? item.file : null)).filter((file): file is ExplorerFile => Boolean(file));
      setViewer({ files, index: Math.max(0, files.findIndex((file) => file.id === entry.id)) });
    },
    [entries, navigate]
  );

  const requestDelete = useCallback(
    (targets: ExplorerEntry[]) => {
      if (!canManage || targets.length === 0) return;
      const blocked = targets.filter((entry) => entry.kind === "folder" && !canDeleteFolder(entry.folder));
      const allowed = targets.filter((entry) => !blocked.includes(entry));
      if (blocked.length > 0) notify("error", "Repositórios de automação não podem ser excluídos.");
      if (allowed.length === 0) return;
      const folders = allowed.filter((entry) => entry.kind === "folder").length;
      setConfirm({
        title: allowed.length === 1 ? "Excluir item" : `Excluir ${allowed.length} itens`,
        message:
          allowed.length === 1
            ? `Excluir "${allowed[0].name}"${folders ? " com todo o conteúdo" : ""}? Esta ação não pode ser desfeita.`
            : `Excluir ${allowed.length} itens${folders ? ` (incluindo ${folders} pasta(s) com todo o conteúdo)` : ""}? Esta ação não pode ser desfeita.`,
        confirmLabel: "Excluir",
        danger: true,
        onConfirm: () => void actions.deleteEntries(allowed)
      });
    },
    [actions, canManage, notify]
  );

  const startRename = useCallback(
    (entry: ExplorerEntry | undefined) => {
      if (!canManage || !entry) return;
      if (entry.kind === "folder" && !canRenameFolder(entry.folder)) {
        notify("error", "O nome desta pasta é definido pela automação do veículo.");
        return;
      }
      setRenamingKey(entry.key);
    },
    [canManage, notify]
  );

  const startNewFolder = useCallback(() => {
    if (!canManage || !model) return;
    setQuery("");
    selection.clear();
    setPendingFolderName(uniqueChildFolderName(model, currentFolderId));
  }, [canManage, currentFolderId, model, selection]);

  const submitNewFolder = useCallback(
    async (name: string) => {
      setPendingFolderName(null);
      const folder = await actions.createChildFolder(currentFolderId, name);
      if (folder) selection.selectKeys([folderKey(folder.id)]);
    },
    [actions, currentFolderId, selection]
  );

  const movableKeys = useCallback(
    (targets: ExplorerEntry[]) =>
      targets.filter((entry) => entry.kind === "file" || !isFolderLocked(entry.folder)).map((entry) => entry.key),
    []
  );

  const cut = useCallback(
    (targets: ExplorerEntry[]) => {
      if (!canManage) return;
      const keys = movableKeys(targets);
      if (keys.length === 0) {
        notify("error", "Pastas de automação não podem ser movidas manualmente.");
        return;
      }
      setClipboard(keys);
      notify("info", `${keys.length} ${keys.length === 1 ? "item recortado" : "itens recortados"} — abra a pasta destino e cole (Ctrl+V).`);
    },
    [canManage, movableKeys, notify]
  );

  const paste = useCallback(() => {
    if (!canManage || !clipboard || !currentFolderId) return;
    const keys = clipboard;
    setClipboard(null);
    void actions.moveEntries(keys, currentFolderId);
  }, [actions, canManage, clipboard, currentFolderId]);

  const downloadEntries = useCallback(
    (targets: ExplorerEntry[]) => {
      const files = targets.flatMap((entry) => (entry.kind === "file" ? [entry.file] : model ? getFolderFiles(model, entry.id) : []));
      if (files.length === 0) {
        notify("info", "Nada para baixar.");
        return;
      }
      void actions.downloadFiles(files);
    },
    [actions, model, notify]
  );

  const pickFiles = useCallback(() => {
    if (canManage && currentFolderId) fileInputRef.current?.click();
  }, [canManage, currentFolderId]);

  const handleReorder = useCallback(
    (fileIds: string[], beforeFileId: string | null) => {
      if (!model || !currentFolderId) return;
      const ordered = getFolderFiles(model, currentFolderId).map((file) => file.id);
      const next = reorderFileIds(ordered, fileIds, beforeFileId);
      if (next.join() !== ordered.join()) void actions.reorder(currentFolderId, next);
    },
    [actions, currentFolderId, model]
  );

  const dnd = useExplorerDnd({
    canManage,
    model,
    currentFolderId,
    reorderEnabled: !searching && effectiveSortKey === "order",
    dragKeysFor: (key) => (selection.selected.has(key) ? selection.selectedKeys : [key]),
    onMove: (keys, folderId) => void actions.moveEntries(keys, folderId),
    onUpload: (files, folderId) => router.requestUpload(files, folderId),
    onReorder: handleReorder
  });

  // ------------------------------------------------------------ cliques
  const handleEntryClick = useCallback(
    (entry: ExplorerEntry, event: MouseEvent) => {
      // 2º clique de um duplo-clique: a pasta já abriu no 1º.
      if (event.detail > 1) return;
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl || event.shiftKey) {
        selection.click(entry.key, { ctrl, shift: event.shiftKey });
        return;
      }
      if (selecting) {
        selection.toggle(entry.key);
        return;
      }
      setFocus(entry.key);
      openEntry(entry);
    },
    [openEntry, selecting, selection, setFocus]
  );

  const handleEntryOpen = useCallback(
    (entry: ExplorerEntry) => {
      // No modo navegação o clique simples já abriu; o duplo só vale selecionando.
      if (!selecting || Date.now() - lastNavigationAtRef.current < 600) return;
      openEntry(entry);
    },
    [openEntry, selecting]
  );

  const extractExisting = useCallback(
    async (file: ExplorerFile, template: OcrTemplateSummary) => {
      const folder = model?.foldersById.get(file.folderId);
      const vehicle = { carroId: folder?.managedCarroId ?? null, placa: folder?.vehicle?.placa ?? null };
      notify("info", `Lendo “${file.name}”…`);
      try {
        const signed = await signedUrlStore.resolve(file.id, "original");
        if (!signed?.url) throw new Error("Arquivo indisponível no armazenamento.");
        const response = await fetch(signed.url);
        const blob = new File([await response.blob()], file.name, { type: file.mimeType });
        const fresh = (await router.ocr.refresh())?.find((entry) => entry.id === template.id);
        if (!fresh || !fresh.active) {
          notify("error", "Este template foi alterado ou desativado. Abra o menu de novo.");
          return;
        }
        const { results, check, anchors, conflicts } = await router.ocr.extract(blob, fresh, vehicle);
        if (!check.ok) {
          notify("error", `Cancelado — ${check.reason}. Nada foi gravado.`);
          return;
        }
        await router.ocr.present(fresh, results, vehicle, file.name, anchors, conflicts);
      } catch (error) {
        notify("error", error instanceof Error ? error.message : "Falha ao ler o documento.");
      }
    },
    [model, notify, router.ocr]
  );

  const entryMenuItems = useCallback(
    (targets: ExplorerEntry[]): MenuItem[] => {
      const single = targets.length === 1 ? targets[0] : null;
      const files = targets.filter((entry) => entry.kind === "file");
      const folder = single?.kind === "file" ? model?.foldersById.get(single.file.folderId) : null;
      const isPhoto = single?.kind === "file" && folder?.automationKey === "vehicle_photos" && single.file.mimeType.startsWith("image/");
      const isCover = Boolean(single && folder?.vehicle?.coverFileId === single.id);
      const items: MenuItem[] = [];
      if (single) items.push({ label: "Abrir", icon: "open", shortcut: "Enter", onSelect: () => openEntry(single) });
      if (single && locations) {
        const location = locations.get(single.key);
        items.push({ label: "Abrir local", icon: "move", onSelect: () => navigate(location?.folderId ?? null) });
      }
      if (files.length > 0 || targets.some((entry) => entry.kind === "folder")) {
        items.push({ label: "Baixar", icon: "download", onSelect: () => downloadEntries(targets) });
      }
      const ocrTemplates = canManage ? router.ocr.templates.filter((template) => template.active && template.fields.length > 0) : [];
      if (single?.kind === "file" && /^(application\/pdf|image\/)/.test(single.file.mimeType) && ocrTemplates.length > 0) {
        const placa = folder?.vehicle?.placa ?? null;
        const preferred = activeTemplateFor(ocrTemplates, placa ? matchDocumentType(single.file.name, placa)?.key : null);
        const ordered = preferred ? [preferred, ...ocrTemplates.filter((template) => template.id !== preferred.id)] : ocrTemplates;
        ordered.slice(0, 4).forEach((template) =>
          items.push({ label: `Extrair dados: ${template.name}`, icon: "scan", onSelect: () => void extractExisting(single.file, template) })
        );
      }
      if (canManage) {
        items.push({ type: "separator" });
        items.push({ label: "Recortar", icon: "cut", shortcut: "Ctrl+X", onSelect: () => cut(targets) });
        items.push({ label: "Mover para…", icon: "move", onSelect: () => setMoveRequest(movableKeys(targets)) });
        items.push({
          label: "Renomear",
          icon: "rename",
          shortcut: "F2",
          disabled: !single || (single.kind === "folder" && !canRenameFolder(single.folder)),
          onSelect: () => startRename(single ?? undefined)
        });
        if (isPhoto && folder && single?.kind === "file") {
          items.push({
            label: isCover ? "Remover capa" : "Definir como capa",
            icon: "star",
            onSelect: () => void actions.setCover(folder, isCover ? null : single.file)
          });
        }
        items.push({ type: "separator" });
        items.push({ label: "Excluir", icon: "trash", shortcut: "Del", danger: true, onSelect: () => requestDelete(targets) });
      }
      items.push({ type: "separator" });
      items.push({ label: "Propriedades", icon: "pane", onSelect: () => setDetailsOpen(true) });
      return items;
    },
    [actions, canManage, cut, downloadEntries, extractExisting, locations, model, movableKeys, navigate, openEntry, requestDelete, router.ocr.templates, setDetailsOpen, startRename]
  );

  const handleEntryContextMenu = useCallback(
    (entry: ExplorerEntry, event: MouseEvent) => {
      const targets = selection.selected.has(entry.key) ? selectedEntries : [entry];
      setFocus(entry.key);
      setMenu({ x: event.clientX, y: event.clientY, items: entryMenuItems(targets) });
    },
    [entryMenuItems, selectedEntries, selection, setFocus]
  );

  const setViewMode = useCallback((mode: ViewMode) => prefsApi.setView(prefKind, mode), [prefKind, prefsApi]);

  const handleBackgroundContextMenu = useCallback(
    (event: MouseEvent) => {
      selection.clear();
      const items: MenuItem[] = [];
      if (canManage) {
        items.push({ label: "Nova pasta", icon: "folderPlus", shortcut: "Ctrl+Shift+N", onSelect: startNewFolder });
        items.push({ label: "Enviar arquivos", icon: "upload", disabled: !currentFolderId, onSelect: pickFiles });
        items.push({ label: "Colar", icon: "paste", shortcut: "Ctrl+V", disabled: !clipboard || !currentFolderId, onSelect: paste });
        items.push({ type: "separator" });
      }
      (Object.keys(VIEW_MODE_LABELS) as ViewMode[]).forEach((mode) =>
        items.push({ label: VIEW_MODE_LABELS[mode], icon: mode === viewMode ? "check" : undefined, onSelect: () => setViewMode(mode) })
      );
      items.push({ type: "separator" });
      if (currentFolderId) items.push({ label: "Baixar pasta", icon: "download", onSelect: () => downloadEntries(entries.filter((entry) => entry.kind === "file")) });
      items.push({ label: "Atualizar", icon: "refresh", onSelect: () => void indexApi.refresh("foreground") });
      setMenu({ x: event.clientX, y: event.clientY, items });
    },
    [canManage, clipboard, currentFolderId, downloadEntries, entries, indexApi, paste, pickFiles, selection, setViewMode, startNewFolder, viewMode]
  );

  const handleTreeContextMenu = useCallback(
    (folderId: string, x: number, y: number) => {
      const folder = model?.foldersById.get(folderId);
      if (!folder || !model) return;
      const entry = listFolderEntries(model, folder.parentId).find((item) => item.id === folderId);
      const items: MenuItem[] = [{ label: "Abrir", icon: "open", onSelect: () => navigate(folderId) }];
      if (entry) items.push({ label: "Baixar arquivos", icon: "download", onSelect: () => downloadEntries([entry]) });
      if (canManage && entry) {
        items.push({ type: "separator" });
        items.push({ label: "Mover para…", icon: "move", disabled: isFolderLocked(folder), onSelect: () => setMoveRequest([entry.key]) });
        items.push({ label: "Excluir", icon: "trash", danger: true, disabled: !canDeleteFolder(folder), onSelect: () => requestDelete([entry]) });
      }
      setMenu({ x, y, items });
    },
    [canManage, downloadEntries, model, navigate, requestDelete]
  );

  // ------------------------------------------------------------- teclado
  const handleContentKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (isTypingTarget(event.target)) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const focused = selection.focus ? entryByKey.get(selection.focus) : undefined;
      // Sem seleção, os comandos de teclado agem no item em foco.
      const targets = selectedEntries.length > 0 ? selectedEntries : focused ? [focused] : [];
      const primary = focused ?? selectedEntries[0];

      if (event.key === "Enter" && primary) {
        event.preventDefault();
        openEntry(primary);
      } else if (event.key === " " && focused) {
        event.preventDefault();
        selection.toggle(focused.key);
      } else if (event.key === "Delete" && targets.length > 0) {
        event.preventDefault();
        requestDelete(targets);
      } else if (event.key === "F2" && targets.length === 1) {
        event.preventDefault();
        startRename(targets[0]);
      } else if (event.key === "Backspace" || (event.altKey && event.key === "ArrowUp")) {
        event.preventDefault();
        if (searching) setQuery("");
        else nav.up();
      } else if (ctrl && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selection.selectAll();
      } else if (ctrl && event.key.toLowerCase() === "x" && targets.length > 0) {
        event.preventDefault();
        cut(targets);
      } else if (ctrl && event.key.toLowerCase() === "v" && clipboard) {
        event.preventDefault();
        paste();
      } else if (event.key === "Escape") {
        if (clipboard) setClipboard(null);
        else {
          selection.clear();
          setSelectionMode(false);
        }
      }
    },
    [clipboard, cut, entryByKey, nav, openEntry, paste, requestDelete, searching, selectedEntries, selection, startRename]
  );

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (isTypingTarget(event.target) || viewer || confirm || moveRequest || settingsOpen) return;
      if (event.key === "Escape" && (selection.selected.size > 0 || selectionMode)) {
        // Esc limpa a seleção mesmo com o foco fora da lista (ex.: depois de renomear).
        selection.clear();
        setSelectionMode(false);
      } else if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        nav.back();
      } else if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        nav.forward();
      } else if (ctrl && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startNewFolder();
      } else if (event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        toggleDetails();
      }
    };
    // Colar arquivos/prints do sistema direto na pasta atual.
    const onPaste = (event: ClipboardEvent) => {
      if (!canManage || !currentFolderId || isTypingTarget(event.target)) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      router.requestUpload(files, currentFolderId);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [canManage, confirm, currentFolderId, moveRequest, nav, router, selection, selectionMode, settingsOpen, startNewFolder, toggleDetails, viewer]);

  // ------------------------------------------------------------ comandos
  const single = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const allSelected = entries.length > 0 && selectedEntries.length === entries.length;
  const focusedEntry = selection.focus ? entryByKey.get(selection.focus) : undefined;
  const paneSelection = selectedEntries.length > 0 ? selectedEntries : focusedEntry?.kind === "file" ? [focusedEntry] : [];
  // Barra contextual: sem seleção = ações da pasta; com seleção = ações nos itens.
  const hasSelection = selectedEntries.length > 0;
  const toggleSelectAll = () => {
    if (allSelected) {
      selection.clear();
      setSelectionMode(false);
    } else {
      selection.selectAll();
      setSelectionMode(true);
    }
  };
  const selectAllAction: CommandAction = {
    id: "select-all",
    label: allSelected ? "Limpar seleção" : "Selecionar tudo",
    icon: "check",
    disabled: entries.length === 0,
    onClick: toggleSelectAll,
    title: "Selecionar tudo (Ctrl+A)"
  };
  const commandActions: CommandAction[] = hasSelection
    ? [
        {
          id: "download",
          label: "Baixar",
          icon: "download",
          onClick: () => downloadEntries(selectedEntries)
        },
        { id: "cut", label: "Recortar", icon: "cut", hidden: !canManage, onClick: () => cut(selectedEntries), title: "Recortar (Ctrl+X)" },
        { id: "move", label: "Mover", icon: "move", hidden: !canManage, onClick: () => setMoveRequest(movableKeys(selectedEntries)) },
        {
          id: "rename",
          label: "Renomear",
          icon: "rename",
          hidden: !canManage,
          disabled: !single || (single.kind === "folder" && !canRenameFolder(single.folder)),
          onClick: () => startRename(single ?? undefined),
          title: single?.kind === "folder" && !canRenameFolder(single.folder) ? "Pasta do sistema: não pode ser renomeada" : "Renomear (F2)"
        },
        { id: "delete", label: "Excluir", icon: "trash", danger: true, hidden: !canManage, onClick: () => requestDelete(selectedEntries), title: "Excluir (Del)" },
        selectAllAction
      ]
    : [
        { id: "new-folder", label: "Nova pasta", icon: "folderPlus", hidden: !canManage, onClick: startNewFolder, title: "Nova pasta (Ctrl+Shift+N)" },
        {
          id: "upload",
          label: "Enviar",
          icon: "upload",
          primary: true,
          hidden: !canManage,
          disabled: !currentFolderId,
          onClick: pickFiles,
          title: currentFolderId ? "Enviar arquivos (ou arraste/cole aqui)" : "Abra uma pasta para enviar"
        },
        { id: "paste", label: "Colar", icon: "paste", hidden: !canManage || !clipboard, disabled: !currentFolderId, onClick: paste, title: "Colar (Ctrl+V)" },
        {
          id: "download",
          label: "Baixar pasta",
          icon: "download",
          hidden: !entries.some((entry) => entry.kind === "file"),
          onClick: () => downloadEntries(entries.filter((entry) => entry.kind === "file"))
        },
        {
          id: "select",
          label: selecting ? "Concluir seleção" : "Selecionar",
          icon: "select",
          active: selecting,
          onClick: () => {
            if (selecting) {
              selection.clear();
              setSelectionMode(false);
            } else setSelectionMode(true);
          },
          title: "Modo seleção: clique marca/desmarca em vez de abrir (Esc sai)"
        },
        selectAllAction
      ];

  // Ferramentas num menu só (não disputam espaço com a barra de comandos).
  const toolActions: CommandAction[] = [
    {
      id: "issues",
      label: "Inconsistências",
      icon: "alert",
      hidden: !canSeeIssues,
      active: issuesOpen,
      onClick: () => setIssuesOpen((value) => !value),
      title: "Veículos e pastas fora das regras"
    },
    { id: "ocr", label: "Console OCR", icon: "scan", hidden: !canManage, onClick: () => setOcrConsoleOpen(true), title: "Leitura de documentos (só administrador)" },
    { id: "settings", label: "Automações das pastas", icon: "settings", hidden: !canManage, onClick: () => setSettingsOpen(true) }
  ];

  const coverFileId = currentFolder?.vehicle?.coverFileId ?? null;
  const selectedBytes = selectedEntries.reduce((sum, entry) => sum + (entry.kind === "file" ? entry.sizeBytes : 0), 0);

  let emptyState: ReactNode = null;
  if (!model) {
    emptyState = indexApi.error ? (
      <>
        <strong>{indexApi.error}</strong>
        <button type="button" className={styles.secondaryBtn} onClick={() => void indexApi.refresh("foreground")}>
          Tentar de novo
        </button>
      </>
    ) : (
      <span className={styles.loadingDots}>Carregando arquivos…</span>
    );
  } else if (searching) {
    emptyState = <span>Nenhum item corresponde a “{deferredQuery.trim()}”.</span>;
  } else if (!currentFolderId) {
    emptyState = (
      <>
        <strong>Nenhuma pasta ainda.</strong>
        {canManage ? (
          <button type="button" className={styles.primaryBtn} onClick={startNewFolder}>
            Criar a primeira pasta
          </button>
        ) : null}
      </>
    );
  } else {
    emptyState = <span>{canManage ? "Esta pasta está vazia. Arraste arquivos para cá, cole (Ctrl+V) ou use Enviar." : "Esta pasta está vazia."}</span>;
  }

  return (
    <main className={styles.shell}>
      <WorkspaceHeader actor={actor} title="Arquivos" />

      {ocrConsoleOpen && model ? (
        <OcrConsole
          auth={auth}
          model={model}
          notify={notify}
          onClose={() => setOcrConsoleOpen(false)}
          onIndexChanged={() => void indexApi.refresh()}
        />
      ) : null}
      <div className={styles.explorer} data-testid="file-explorer" hidden={ocrConsoleOpen && Boolean(model)}>
        {model ? (
          <ExplorerAddressBar
            model={model}
            currentFolderId={currentFolderId}
            canBack={nav.canBack}
            canForward={nav.canForward}
            canUp={nav.canUp}
            refreshing={indexApi.refreshing}
            onBack={nav.back}
            onForward={nav.forward}
            onUp={nav.up}
            onRefresh={() => void indexApi.refresh("foreground")}
            onNavigate={navigate}
            query={query}
            onQueryChange={setQuery}
            scope={scope}
            onScopeChange={setScope}
            searchRef={searchRef}
            dnd={dnd}
            onToggleTree={() => setMobileTreeOpen((value) => !value)}
          />
        ) : (
          <AddressSkeleton path={storedPath} />
        )}

        <ExplorerCommandBar
          actions={commandActions}
          viewMode={viewMode}
          onViewMode={setViewMode}
          sortKey={effectiveSortKey}
          sortDirection={sort.direction}
          sortOptions={sortOptions}
          onSort={(key, direction) => prefsApi.setSort(prefKind, key, direction)}
          navPaneOpen={prefsApi.prefs.navPane}
          detailsPaneOpen={detailsOpen}
          onToggleNavPane={() => (isNarrow ? setMobileTreeOpen((value) => !value) : prefsApi.toggleNavPane())}
          onToggleDetailsPane={toggleDetails}
          tools={toolActions}
          selectionCount={selectedEntries.length}
          onClearSelection={() => {
            selection.clear();
            setSelectionMode(false);
          }}
        />

        {notices.length > 0 ? (
          <div className={styles.notices} role="status" aria-live="polite">
            {notices.map((notice) => (
              <div key={notice.id} className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}>
                <span>{notice.text}</span>
                <button type="button" className={styles.iconBtn} onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))} aria-label="Dispensar">
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className={styles.body} data-nav={prefsApi.prefs.navPane} data-details={detailsOpen}>
          {model ? (
            <>
              <div
                ref={navPaneRef}
                className={`${styles.navPane} ${mobileTreeOpen ? styles.navPaneMobileOpen : ""}`}
                data-desktop-hidden={!prefsApi.prefs.navPane}
              >
                <ExplorerTree
                  model={model}
                  currentFolderId={currentFolderId}
                  expanded={expanded}
                  dnd={dnd}
                  onToggle={(id) =>
                    updateExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onCollapseAll={() => updateExpanded(() => new Set())}
                  onRevealCurrent={currentFolderId ? revealCurrentInTree : undefined}
                  onNavigate={navigate}
                  onContextMenu={handleTreeContextMenu}
                />
              </div>
              {mobileTreeOpen ? <button type="button" className={styles.scrim} aria-label="Fechar pastas" onClick={() => setMobileTreeOpen(false)} /> : null}
            </>
          ) : (
            <div className={styles.navPane} data-desktop-hidden={!prefsApi.prefs.navPane} />
          )}

          <section className={styles.main}>
            {issuesOpen && model && canSeeIssues ? (
              <ExplorerIssues
                auth={auth}
                model={model}
                canManage={canManage}
                notify={notify}
                onNavigate={(folderId) => {
                  setIssuesOpen(false);
                  navigate(folderId);
                }}
                onClose={() => setIssuesOpen(false)}
                onChanged={() => void indexApi.refresh()}
                onToggleAutomation={(folder) => actions.toggleAutomation(folder)}
              />
            ) : null}
            {issuesOpen && canSeeIssues ? null : searchResult ? (
              <div className={styles.searchBanner} data-testid="explorer-search-banner">
                <span>
                  {searchResult.total} resultado(s) para “{deferredQuery.trim()}”
                  {scope === "folder" && currentFolder ? ` em ${folderLabel(currentFolder)}` : ""}
                </span>
                {searchResult.total > searchResult.hits.length ? (
                  <button type="button" className={styles.linkBtn} onClick={() => setShowAllResults(true)}>
                    Mostrar todos
                  </button>
                ) : null}
                <button type="button" className={styles.linkBtn} onClick={() => setQuery("")}>
                  Limpar
                </button>
              </div>
            ) : null}
            {issuesOpen && canSeeIssues ? null : (
            <ExplorerContent
              entries={entries}
              viewMode={viewMode}
              selected={selection.selected}
              focusKey={selection.focus}
              cutKeys={cutKeys}
              renamingKey={renamingKey}
              pendingFolderName={pendingFolderName}
              uploads={folderUploads}
              coverFileId={coverFileId}
              locations={locations}
              query={searching ? deferredQuery : ""}
              sortKey={effectiveSortKey}
              sortDirection={sort.direction}
              canManage={canManage}
              dnd={dnd}
              contentRef={contentRef}
              emptyState={emptyState}
              onSortHeader={(key) =>
                prefsApi.setSort(prefKind, key, effectiveSortKey === key && sort.direction === "asc" ? "desc" : "asc")
              }
              onEntryClick={handleEntryClick}
              onEntryOpen={handleEntryOpen}
              selecting={selecting}
              onEntryContextMenu={handleEntryContextMenu}
              onToggleCheck={(entry) => selection.toggle(entry.key)}
              onBackgroundClick={() => selection.clear()}
              onBackgroundContextMenu={handleBackgroundContextMenu}
              onRenameSubmit={(entry, name) => {
                setRenamingKey(null);
                contentRef.current?.focus({ preventScroll: true });
                void actions.renameEntry(entry, name);
              }}
              onRenameCancel={() => setRenamingKey(null)}
              onPendingFolderSubmit={(name) => void submitNewFolder(name)}
              onPendingFolderCancel={() => setPendingFolderName(null)}
              onOpenLocation={navigate}
              onMoveFocus={selection.moveFocus}
              onKeyDown={handleContentKeyDown}
            />
            )}
          </section>

          {model && detailsOpen ? (
            <ExplorerDetailsPane
              auth={auth}
              notify={notify}
              onDownloadFiles={(files) => void actions.downloadFiles(files)}
              model={model}
              currentFolder={currentFolder}
              selection={paneSelection}
              canManage={canManage}
              coverFileId={
                paneSelection[0]?.kind === "file"
                  ? (model.foldersById.get(paneSelection[0].file.folderId)?.vehicle?.coverFileId ?? null)
                  : coverFileId
              }
              onClose={() => setDetailsOpen(false)}
              onOpen={openEntry}
              onDownload={downloadEntries}
              onRename={startRename}
              onMove={(targets) => setMoveRequest(movableKeys(targets))}
              onDelete={requestDelete}
              onSetCover={(file) => {
                const folder = file ? model.foldersById.get(file.folderId) : currentFolder;
                const target = folder ?? (paneSelection[0]?.kind === "file" ? model.foldersById.get(paneSelection[0].file.folderId) : null);
                if (target) void actions.setCover(target, file);
              }}
              onToggleAutomation={(folder) => void actions.toggleAutomation(folder)}
              onSaveDescription={(folder, description) => void actions.saveDescription(folder, description)}
              onNavigate={navigate}
            />
          ) : null}
        </div>

        <footer className={styles.statusBar} data-testid="explorer-status">
          <span>
            {entries.length} {entries.length === 1 ? "item" : "itens"}
          </span>
          {selectedEntries.length > 0 ? (
            <span>
              {selectedEntries.length} selecionado(s){selectedBytes > 0 ? ` · ${formatBytes(selectedBytes)}` : ""}
            </span>
          ) : null}
          {clipboard ? <span>{clipboard.length} recortado(s)</span> : null}
          {uploads.items.length > 0 ? (
            <span className={styles.statusUpload} data-testid="files-upload-toast">
              {uploadSummary.inFlight > 0 ? (
                <>
                  <span className={styles.statusSpinner} aria-hidden="true" />
                  Enviando {uploadSummary.done + 1 > uploadSummary.total ? uploadSummary.total : uploadSummary.done + 1} de {uploadSummary.total} ·{" "}
                  {Math.round(uploadSummary.ratio * 100)}%
                  <button type="button" className={styles.linkBtn} onClick={uploads.cancelAll}>
                    Cancelar
                  </button>
                </>
              ) : uploadSummary.failed > 0 ? (
                <>
                  {uploadSummary.failed} falha(s) no envio
                  <button type="button" className={styles.linkBtn} onClick={uploads.retryFailed}>
                    Tentar de novo
                  </button>
                  <button type="button" className={styles.linkBtn} onClick={uploads.clearFinished}>
                    Dispensar
                  </button>
                </>
              ) : (
                <>Envio concluído ✓</>
              )}
            </span>
          ) : null}
          <span className={styles.flexSpacer} />
          {indexApi.model ? (
            <span className={styles.statusHint}>
              {indexApi.model.foldersById.size} pastas · {indexApi.model.filesById.size} arquivos
            </span>
          ) : null}
          <span className={styles.statusViews}>
            <button type="button" className={`${styles.iconBtn} ${viewMode === "details" ? styles.iconBtnActive : ""}`} onClick={() => setViewMode("details")} aria-label="Detalhes" title="Detalhes">
              <Icon name="viewDetails" size={14} />
            </button>
            <button type="button" className={`${styles.iconBtn} ${viewMode === "large" ? styles.iconBtnActive : ""}`} onClick={() => setViewMode("large")} aria-label="Ícones grandes" title="Ícones grandes">
              <Icon name="viewTiles" size={14} />
            </button>
          </span>
        </footer>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        data-testid="explorer-file-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (currentFolderId && files.length > 0) router.requestUpload(files, currentFolderId);
        }}
      />

      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
      {confirm ? <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} /> : null}
      {moveRequest && model ? (
        <MoveDialog
          model={model}
          title={`Mover ${moveRequest.length} ${moveRequest.length === 1 ? "item" : "itens"} para…`}
          initialFolderId={currentFolderId}
          movingFolderIds={moveRequest.map(parseEntryKey).filter((entry) => entry?.kind === "folder").map((entry) => entry?.id ?? "")}
          onConfirm={(folderId) => void actions.moveEntries(moveRequest, folderId)}
          onClose={() => setMoveRequest(null)}
        />
      ) : null}
      {viewer ? (
        <FileViewer
          files={viewer.files}
          startIndex={viewer.index}
          onClose={() => setViewer(null)}
          onDownload={(file) => void actions.downloadFiles([file])}
        />
      ) : null}
      {settingsOpen && model ? (
        <AutomationSettingsDialog
          auth={auth}
          model={model}
          notify={notify}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => void indexApi.refresh("foreground")}
        />
      ) : null}
      {router.dialogs}
    </main>
  );
}

