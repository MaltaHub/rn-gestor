"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { createFolder, deleteOcrTemplate, finalizeUploads, getOcrTemplate, prepareUploads, saveOcrTemplate } from "@/components/files/api";
import { DOCUMENT_TYPES } from "@/components/files/document-slots";
import ex from "@/components/files/explorer/explorer.module.css";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { ConfirmDialog } from "@/components/files/explorer/explorer-overlays";
import type { ExplorerModel } from "@/components/files/explorer/model";
import { signedUrlStore } from "@/components/files/explorer/signed-url-store";
import { OcrFilePicker } from "@/components/files/ocr/ocr-file-picker";
import { readDocument, renderPages, type RenderedPage } from "@/components/files/ocr/ocr-runtime";
import styles from "@/components/files/ocr/ocr.module.css";
import { destinationFor, invalidateOcrTemplates, loadOcrCatalog, loadOcrTemplates, resolveAnchorVehicle } from "@/components/files/ocr/use-ocr";
import type { RequestAuth } from "@/components/ui-grid/types";
import { DestinationPicker } from "@/components/files/ocr/destination-picker";
import type { OcrCatalogTable } from "@/lib/domain/ocr/catalog";
import {
  anchorLabel,
  applyTransforms,
  checkAnchors,
  extractTemplate,
  joinLines,
  joinWords,
  suggestWildcards,
  unionBox,
  wordsInRegion
} from "@/lib/domain/ocr/engine";
import type { OcrTemplateInput } from "@/lib/domain/ocr/schemas";
import {
  type OcrAnchor,
  type OcrAnchorResult,
  type OcrAnchorVehicleField,
  type OcrDocument,
  type OcrField,
  type OcrTemplateSummary,
  type OcrTransform,
  type OcrWildcard,
  type OcrWildcardKind
} from "@/lib/domain/ocr/types";
import type { ExplorerFile } from "@/lib/files/explorer-types";

type Notify = (kind: "info" | "error", text: string) => void;
type Draft = OcrTemplateInput & { id: string | null };

const SAMPLE_FOLDER_NAME = "Modelos de OCR";

/** Filtro de caracteres: escolha ÚNICA (só dígitos já é "só letras e dígitos" sem letras). */
const CHARSET_OPTIONS: Array<{ value: "all" | "alnum_only" | "digits_only"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "alnum_only", label: "Letras e dígitos" },
  { value: "digits_only", label: "Só dígitos" }
];

/** Monta os ajustes na ordem certa; espaços repetidos/nas pontas já saem sempre. */
function buildTransforms(options: { upper: boolean; charset: "all" | "alnum_only" | "digits_only"; noSpaces: boolean }): OcrTransform[] {
  const out: OcrTransform[] = [];
  if (options.upper) out.push("upper");
  if (options.charset !== "all") out.push(options.charset);
  else if (options.noSpaces) out.push("no_spaces");
  return out;
}

const WILDCARD_LABELS: Record<OcrWildcardKind, string> = {
  length: "Quantidade de caracteres",
  contains: "Contém o texto",
  starts_with: "Começa com",
  ends_with: "Termina com",
  mask: "Formato (máscara)",
  charset: "Só tipo de caractere",
  after_label: "Vem depois do rótulo",
  regex: "Expressão regular"
};

function newWildcard(kind: OcrWildcardKind, sample: string): OcrWildcard {
  switch (kind) {
    case "length":
      return { kind, min: sample.length || 1, max: sample.length || 1 };
    case "mask":
      return suggestWildcards(sample).find((entry) => entry.kind === "mask") ?? { kind, mask: "AAA9999" };
    case "charset":
      return { kind, set: "digits" };
    case "after_label":
      return { kind, label: "" };
    case "regex":
      return { kind, source: "" };
    default:
      return { kind, value: "" };
  }
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: "Novo template",
    documentTypeKey: null,
    active: true,
    applyMode: "confirm",
    markReady: false,
    sampleFileId: null,
    sampleDocument: null,
    fields: [],
    // Padrão: o documento precisa conter a placa do veículo da pasta de destino.
    anchors: [{ kind: "vehicle", field: "placa" }]
  };
}

const VEHICLE_ANCHORS: Array<{ field: OcrAnchorVehicleField; label: string }> = [
  { field: "placa", label: "Placa do veículo da pasta" },
  { field: "chassi", label: "Chassi do veículo da pasta" },
  { field: "renavam", label: "Renavam do veículo da pasta" },
  { field: "codigo_nota_fiscal", label: "Código da nota fiscal do veículo" }
];

/** Destino provável pelo formato do texto selecionado (o usuário confirma). */
function guessDestination(text: string) {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  if (/^\d{11}$/.test(compact)) return "carros.renavam";
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(compact) && /\d/.test(compact) && /[A-Z]/.test(compact)) return "carros.chassi";
  if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(compact)) return "check.placa";
  if (/^(19|20)\d{2}$/.test(compact)) return "carros.ano_fab";
  return "none";
}

function localId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `f-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function blobForExplorerFile(file: ExplorerFile) {
  const entry = await signedUrlStore.resolve(file.id, "original");
  if (!entry?.url) throw new Error("Arquivo indisponível no armazenamento.");
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error("Falha ao baixar o arquivo.");
  return new File([await response.blob()], file.name, { type: file.mimeType });
}

/** startWord: palavra sob o ponteiro no pointerdown (com pointer capture o pointerup chega no overlay). */
type Marquee = { page: number; x0: number; y0: number; x1: number; y1: number; additive: boolean; moved: boolean; startWord: number };

export function OcrConsole({
  auth,
  model,
  notify,
  onClose,
  onIndexChanged
}: {
  auth: RequestAuth;
  model: ExplorerModel;
  notify: Notify;
  onClose: () => void;
  onIndexChanged: () => void;
}) {
  const [templates, setTemplates] = useState<OcrTemplateSummary[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [picker, setPicker] = useState<"sample" | "test" | null>(null);
  const [test, setTest] = useState<{ name: string; document: OcrDocument; pages: RenderedPage[]; sourceFileId: string | null } | null>(null);
  const [anchorResults, setAnchorResults] = useState<OcrAnchorResult[] | null>(null);
  const [textAnchor, setTextAnchor] = useState<string | null>(null);
  const [view, setView] = useState<"sample" | "test">("sample");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  // Último retângulo arrastado: base da MÁSCARA DE ÁREA (área exata, não o contorno das palavras).
  const [lastRect, setLastRect] = useState<{ page: number; x: number; y: number; w: number; h: number } | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [catalog, setCatalog] = useState<OcrCatalogTable[] | null>(null);

  useEffect(() => {
    loadOcrCatalog(auth)
      .then(setCatalog)
      .catch(() => {
        setCatalog([]);
        notify("error", "Falha ao carregar as colunas de destino.");
      });
  }, [auth, notify]);

  const refreshList = useCallback(async () => {
    invalidateOcrTemplates();
    try {
      setTemplates(await loadOcrTemplates(auth));
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao listar templates.");
    }
  }, [auth, notify]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const patch = useCallback((change: Partial<Draft> | ((current: Draft) => Draft)) => {
    setDraft((current) => (current ? (typeof change === "function" ? change(current) : { ...current, ...change }) : current));
    setDirty(true);
  }, []);

  const patchField = useCallback(
    (fieldId: string, change: Partial<OcrField>) =>
      patch((current) => ({ ...current, fields: current.fields.map((field) => (field.id === fieldId ? { ...field, ...change } : field)) })),
    [patch]
  );

  // ------------------------------------------------------------ carregar
  const loadSample = useCallback(async (file: Blob & { name?: string }, storedDocument: OcrDocument | null) => {
    setProgress("Preparando o documento…");
    try {
      if (storedDocument) {
        setPages(await renderPages(file));
        return storedDocument;
      }
      const result = await readDocument(file, { renderPages: true, onProgress: setProgress });
      setPages(result.pages);
      return result.document;
    } finally {
      setProgress(null);
    }
  }, []);

  const openTemplate = useCallback(
    async (id: string) => {
      setSelected(new Set());
      setActiveFieldId(null);
      setTest(null);
      setView("sample");
      setPages([]);
      try {
        const { template } = await getOcrTemplate(auth, id);
        setDraft({
          id: template.id,
          name: template.name,
          documentTypeKey: template.documentTypeKey,
          active: template.active,
          applyMode: template.applyMode,
          markReady: template.markReady,
          sampleFileId: template.sampleFileId,
          sampleDocument: template.sampleDocument,
          fields: template.fields,
          anchors: template.anchors ?? []
        });
        setDirty(false);
        const sample = template.sampleFileId ? model.filesById.get(template.sampleFileId) : null;
        if (sample) {
          const document = await loadSample(await blobForExplorerFile(sample), template.sampleDocument);
          if (!template.sampleDocument) setDraft((current) => (current ? { ...current, sampleDocument: document } : current));
        }
      } catch (error) {
        notify("error", error instanceof Error ? error.message : "Falha ao abrir o template.");
      }
    },
    [auth, loadSample, model, notify]
  );

  const pickExplorerSample = async (file: ExplorerFile) => {
    try {
      const document = await loadSample(await blobForExplorerFile(file), null);
      patch({ sampleFileId: file.id, sampleDocument: document });
      setView("sample");
      setSelected(new Set());
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao ler o exemplo.");
    }
  };

  // Exemplo do computador: guardado em "Modelos de OCR" para o template poder reabrir.
  const pickLocalSample = async (file: File) => {
    try {
      setProgress("Enviando o exemplo…");
      let folder = (model.childFolderIds.get(null) ?? [])
        .map((id) => model.foldersById.get(id))
        .find((entry) => entry?.name === SAMPLE_FOLDER_NAME);
      if (!folder) folder = (await createFolder(auth, { name: SAMPLE_FOLDER_NAME, description: "Arquivos de exemplo dos templates de OCR." })).folder;
      const meta = { fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size };
      const { entries } = await prepareUploads(auth, folder.id, [meta]);
      const plan = entries[0];
      const put = await fetch(plan.signedUrl, { method: "PUT", headers: { "content-type": plan.mimeType, "x-upsert": "false" }, body: file });
      if (!put.ok) throw new Error("Falha ao enviar o exemplo.");
      const { files } = await finalizeUploads(auth, folder.id, [plan]);
      onIndexChanged();
      const document = await loadSample(file, null);
      patch({ sampleFileId: files[0]?.id ?? null, sampleDocument: document });
      setView("sample");
      setSelected(new Set());
    } catch (error) {
      setProgress(null);
      notify("error", error instanceof Error ? error.message : "Falha ao usar o exemplo.");
    }
  };

  const runTest = async (file: Blob & { name?: string }, sourceFileId: string | null = null) => {
    setProgress("Lendo o documento de teste…");
    try {
      const result = await readDocument(file, { renderPages: true, onProgress: setProgress });
      setTest({ name: file.name ?? "documento", document: result.document, pages: result.pages, sourceFileId });
      setView("test");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao ler o documento de teste.");
    } finally {
      setProgress(null);
    }
  };

  // ------------------------------------------------------------- salvar
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { id, ...payload } = draft;
      const { template } = await saveOcrTemplate(auth, id, payload);
      setDraft((current) => (current ? { ...current, id: template.id } : current));
      setDirty(false);
      await refreshList();
      notify("info", "Template salvo.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao salvar o template.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) {
      setDraft(null);
      return;
    }
    try {
      await deleteOcrTemplate(auth, draft.id);
      setDraft(null);
      setPages([]);
      await refreshList();
      notify("info", "Template excluído.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao excluir.");
    }
  };

  // ------------------------------------------------------------ seleção
  const document = view === "test" && test ? test.document : (draft?.sampleDocument ?? null);
  const shownPages = view === "test" && test ? test.pages : pages;
  const results = useMemo(() => (document && draft ? extractTemplate(document, draft) : []), [document, draft]);
  const resultByField = useMemo(() => new Map(results.map((result) => [result.fieldId, result])), [results]);
  const selectedWords = useMemo(
    () => (draft?.sampleDocument && view === "sample" ? Array.from(selected).map((index) => draft.sampleDocument!.words[index]).filter(Boolean) : []),
    [draft?.sampleDocument, selected, view]
  );
  const selectionText = joinWords(selectedWords);
  const activeField = draft?.fields.find((field) => field.id === activeFieldId) ?? null;

  // Âncoras conferidas com o veículo da pasta de onde veio o documento aberto.
  const sourceFileId = view === "test" ? (test?.sourceFileId ?? null) : (draft?.sampleFileId ?? null);
  const sourceFolder = sourceFileId ? model.foldersById.get(model.filesById.get(sourceFileId)?.folderId ?? "") : undefined;
  const anchorVehicleContext = useMemo(
    () => ({ carroId: sourceFolder?.managedCarroId ?? null, placa: sourceFolder?.vehicle?.placa ?? null }),
    [sourceFolder]
  );
  const anchors = draft?.anchors;
  useEffect(() => {
    let active = true;
    if (!document || !anchors) {
      setAnchorResults(null);
      return;
    }
    void resolveAnchorVehicle(auth, anchorVehicleContext, anchors).then((vehicle) => {
      if (active) setAnchorResults(checkAnchors(document, anchors, vehicle));
    });
    return () => {
      active = false;
    };
  }, [anchorVehicleContext, anchors, auth, document]);

  const addAnchor = (anchor: OcrAnchor) =>
    patch((current) => {
      const exists = current.anchors.some((entry) => JSON.stringify(entry) === JSON.stringify(anchor));
      return exists ? current : { ...current, anchors: [...current.anchors, anchor] };
    });

  const createFieldFromSelection = () => {
    if (!draft || selectedWords.length === 0) return;
    const box = unionBox(selectedWords.map((word) => word.box));
    if (!box) return;
    const pad = 0.004;
    const text = selectionText;
    const destination = guessDestination(text);
    const transforms: OcrTransform[] = destination === "none" ? [] : ["upper"];
    const field: OcrField = {
      id: localId(),
      label: destination === "none" ? `Campo ${draft.fields.length + 1}` : destinationFor(destination).label.replace(/ \(.*\)$/, ""),
      destination,
      region: { page: selectedWords[0].page, x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), w: Math.min(1, box.w + pad * 2), h: Math.min(1, box.h + pad * 2) },
      sampleText: text,
      transforms,
      wildcards: suggestWildcards(applyTransforms(text, transforms)),
      required: destination !== "none"
    };
    patch((current) => ({ ...current, fields: [...current.fields, field] }));
    setActiveFieldId(field.id);
    setSelected(new Set());
  };

  const createAreaField = () => {
    if (!draft?.sampleDocument || !lastRect) return;
    const words = wordsInRegion(draft.sampleDocument, lastRect, true);
    const field: OcrField = {
      id: localId(),
      label: `Área ${draft.fields.filter((entry) => entry.mode === "area").length + 1}`,
      mode: "area",
      destination: "none",
      region: lastRect,
      sampleText: joinLines(words),
      transforms: [],
      wildcards: [],
      required: false
    };
    patch((current) => ({ ...current, fields: [...current.fields, field] }));
    setActiveFieldId(field.id);
    setSelected(new Set());
    setLastRect(null);
  };

  const createWildcardField = () => {
    if (!draft) return;
    const field: OcrField = {
      id: localId(),
      label: `Coringa ${draft.fields.length + 1}`,
      destination: "none",
      region: null,
      sampleText: "",
      transforms: [],
      wildcards: [{ kind: "length", min: 1, max: 40 }],
      required: false
    };
    patch((current) => ({ ...current, fields: [...current.fields, field] }));
    setActiveFieldId(field.id);
  };

  const pointerToPage = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const onPointerDown = (page: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (view !== "sample" || !draft?.sampleDocument || event.button !== 0) return;
    const point = pointerToPage(event);
    const wordElement = (event.target as HTMLElement).closest<HTMLElement>("[data-word]");
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee({
      page,
      x0: point.x,
      y0: point.y,
      x1: point.x,
      y1: point.y,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      moved: false,
      startWord: wordElement ? Number(wordElement.dataset.word) : -1
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!marquee) return;
    const point = pointerToPage(event);
    const moved = marquee.moved || Math.hypot(point.x - marquee.x0, point.y - marquee.y0) > 0.004;
    setMarquee({ ...marquee, x1: point.x, y1: point.y, moved });
  };

  const onPointerUp = () => {
    if (!marquee || !draft?.sampleDocument) return;
    const words = draft.sampleDocument.words;
    const current = marquee;
    setMarquee(null);
    if (!current.moved) {
      if (!current.additive) setLastRect(null);
      const index = current.startWord;
      setSelected((previous) => {
        if (index < 0) return current.additive ? previous : new Set();
        const next = current.additive ? new Set(previous) : new Set<number>();
        if (current.additive && previous.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      return;
    }
    const [left, right] = [Math.min(current.x0, current.x1), Math.max(current.x0, current.x1)];
    const [top, bottom] = [Math.min(current.y0, current.y1), Math.max(current.y0, current.y1)];
    setLastRect({ page: current.page, x: Math.max(0, left), y: Math.max(0, top), w: Math.min(1, right) - Math.max(0, left), h: Math.min(1, bottom) - Math.max(0, top) });
    const inside = words
      .map((word, index) => ({ word, index }))
      .filter(({ word }) => {
        if (word.page !== current.page) return false;
        const cx = word.box.x + word.box.w / 2;
        const cy = word.box.y + word.box.h / 2;
        return cx >= left && cx <= right && cy >= top && cy <= bottom;
      })
      .map(({ index }) => index);
    setSelected((previous) => new Set(current.additive ? [...previous, ...inside] : inside));
  };

  // ------------------------------------------------------------- render
  const sampleName = draft?.sampleFileId ? (model.filesById.get(draft.sampleFileId)?.name ?? "exemplo") : null;

  return (
    <div className={styles.console} data-testid="ocr-console">
      <header className={styles.bar}>
        <button type="button" className={ex.iconBtn} onClick={onClose} title="Voltar ao explorer" aria-label="Voltar ao explorer">
          <Icon name="back" />
        </button>
        <button type="button" className={ex.iconBtn} onClick={() => setRailOpen((value) => !value)} aria-label="Templates">
          <Icon name="menu" />
        </button>
        <strong className={styles.barTitle}>
          <Icon name="scan" size={16} /> Console OCR
        </strong>
        {draft ? (
          <>
            <input
              className={styles.nameInput}
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
              aria-label="Nome do template"
              data-testid="ocr-template-name"
            />
            <select
              className={styles.barSelect}
              value={draft.documentTypeKey ?? ""}
              onChange={(event) => patch({ documentTypeKey: event.target.value || null })}
              title="Ao classificar um upload com este tipo, o template roda automaticamente"
              data-testid="ocr-template-type"
            >
              <option value="">Sem tipo (só manual)</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
            <select
              className={styles.barSelect}
              value={draft.applyMode}
              onChange={(event) => patch({ applyMode: event.target.value === "auto" ? "auto" : "confirm" })}
            >
              <option value="confirm">Confirmar antes de gravar</option>
              <option value="auto">Gravar automático (se tudo válido)</option>
            </select>
            <label className={styles.barCheck}>
              <input type="checkbox" checked={draft.active} onChange={(event) => patch({ active: event.target.checked })} /> Ativo
            </label>
            <label className={styles.barCheck} title="Ao gravar, marca o veículo como PRONTO">
              <input type="checkbox" checked={draft.markReady} onChange={(event) => patch({ markReady: event.target.checked })} /> Marcar PRONTO
            </label>
            <span className={ex.flexSpacer} />
            <button type="button" className={ex.secondaryBtn} onClick={() => setPicker("test")} disabled={!draft.fields.length} data-testid="ocr-test">
              Testar em arquivo…
            </button>
            <button type="button" className={ex.primaryBtn} onClick={() => void save()} disabled={saving || !dirty} data-testid="ocr-save">
              {saving ? "Salvando…" : dirty ? "Salvar" : "Salvo"}
            </button>
            <button type="button" className={ex.iconBtn} onClick={() => setConfirmDelete(true)} title="Excluir template" aria-label="Excluir template">
              <Icon name="trash" />
            </button>
          </>
        ) : (
          <span className={ex.flexSpacer} />
        )}
      </header>

      <div className={styles.under} data-rail={railOpen}>
        <nav className={styles.rail} aria-label="Templates">
          <button
            type="button"
            className={ex.primaryBtn}
            onClick={() => {
              setDraft(emptyDraft());
              setDirty(true);
              setPages([]);
              setTest(null);
              setView("sample");
              setSelected(new Set());
              setActiveFieldId(null);
            }}
            data-testid="ocr-new-template"
          >
            <Icon name="plus" size={14} /> Novo template
          </button>
          <div className={styles.railList}>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`${styles.railItem} ${draft?.id === template.id ? styles.railItemActive : ""}`}
                onClick={() => void openTemplate(template.id)}
              >
                <strong>{template.name}</strong>
                <small>
                  {DOCUMENT_TYPES.find((type) => type.key === template.documentTypeKey)?.label ?? "Sem tipo"} · {template.fields.length} campo(s)
                  {template.active ? "" : " · inativo"}
                </small>
              </button>
            ))}
            {templates.length === 0 ? <p className={ex.paneHint}>Nenhum template ainda. Crie um com um documento de exemplo.</p> : null}
          </div>
        </nav>

        <section className={styles.stage}>
          {!draft ? (
            <div className={styles.stageEmpty}>
              <Icon name="scan" size={36} />
              <strong>Automação de leitura de documentos</strong>
              <p>
                Crie um template a partir de um documento de exemplo: selecione na página cada texto que quer registrar e diga para onde ele vai
                (ex.: Renavam do veículo). Use as regras coringa para quando o layout muda.
              </p>
            </div>
          ) : !draft.sampleDocument && view === "sample" ? (
            <div className={styles.stageEmpty}>
              <Icon name="upload" size={32} />
              <strong>Escolha um documento de exemplo</strong>
              <p>Um PDF ou foto do documento. Depois é só selecionar os textos na página.</p>
              <button type="button" className={ex.primaryBtn} onClick={() => setPicker("sample")} data-testid="ocr-pick-sample">
                Escolher exemplo…
              </button>
            </div>
          ) : (
            <>
              <div className={styles.stageBar}>
                <div className={styles.segment}>
                  <button type="button" className={view === "sample" ? styles.segmentOn : ""} onClick={() => setView("sample")}>
                    Exemplo{sampleName ? `: ${sampleName}` : ""}
                  </button>
                  {test ? (
                    <button type="button" className={view === "test" ? styles.segmentOn : ""} onClick={() => setView("test")}>
                      Teste: {test.name}
                    </button>
                  ) : null}
                </div>
                <button type="button" className={ex.linkBtn} onClick={() => setPicker("sample")}>
                  Trocar exemplo
                </button>
                <span className={ex.flexSpacer} />
                <select className={styles.barSelect} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                    <option key={value} value={value}>
                      {value === 1 ? "Ajustar à largura" : `${Math.round(value * 100)}%`}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.paperScroll}>
                {(shownPages.length > 0 ? shownPages : (document?.pages ?? []).map((page) => ({ ...page, url: "" }))).map((page, pageIndex) => (
                  <div key={pageIndex} className={styles.paper} style={{ width: `${zoom * 100}%`, aspectRatio: `${page.width} / ${page.height}` }}>
                    {page.url ? <Image src={page.url} alt={`Página ${pageIndex + 1}`} fill unoptimized draggable={false} className={styles.paperImg} sizes="100vw" /> : null}
                    <div
                      className={styles.paperOverlay}
                      data-mode={view}
                      onPointerDown={(event) => onPointerDown(pageIndex, event)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                    >
                      {(document?.words ?? []).map((word, index) =>
                        word.page === pageIndex ? (
                          <div
                            key={index}
                            data-word={index}
                            className={`${styles.word} ${view === "sample" && selected.has(index) ? styles.wordSelected : ""} ${page.url ? "" : styles.wordText}`}
                            style={{ left: `${word.box.x * 100}%`, top: `${word.box.y * 100}%`, width: `${word.box.w * 100}%`, height: `${word.box.h * 100}%` }}
                            title={word.text}
                          >
                            {page.url ? null : word.text}
                          </div>
                        ) : null
                      )}
                      {draft.fields.map((field) =>
                        field.region && field.region.page === pageIndex ? (
                          <div
                            key={`region-${field.id}`}
                            className={`${styles.region} ${field.mode === "area" ? styles.regionArea : ""} ${field.id === activeFieldId ? styles.regionActive : ""}`}
                            style={{
                              left: `${field.region.x * 100}%`,
                              top: `${field.region.y * 100}%`,
                              width: `${field.region.w * 100}%`,
                              height: `${field.region.h * 100}%`
                            }}
                          >
                            <span>{field.label}</span>
                          </div>
                        ) : null
                      )}
                      {results.flatMap((result) =>
                        result.source === "wildcard"
                          ? result.boxes
                              .filter((box) => box.page === pageIndex)
                              .map((box, index) => (
                                <div
                                  key={`hit-${result.fieldId}-${index}`}
                                  className={styles.hit}
                                  style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
                                />
                              ))
                          : []
                      )}
                      {view === "sample" && !marquee && lastRect && lastRect.page === pageIndex ? (
                        <div
                          className={styles.marqueeKept}
                          style={{ left: `${lastRect.x * 100}%`, top: `${lastRect.y * 100}%`, width: `${lastRect.w * 100}%`, height: `${lastRect.h * 100}%` }}
                        />
                      ) : null}
                      {marquee && marquee.page === pageIndex && marquee.moved ? (
                        <div
                          className={styles.marquee}
                          style={{
                            left: `${Math.min(marquee.x0, marquee.x1) * 100}%`,
                            top: `${Math.min(marquee.y0, marquee.y1) * 100}%`,
                            width: `${Math.abs(marquee.x1 - marquee.x0) * 100}%`,
                            height: `${Math.abs(marquee.y1 - marquee.y0) * 100}%`
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {progress ? (
            <div className={styles.progress} role="status">
              <span className={ex.statusSpinner} aria-hidden="true" /> {progress}
            </div>
          ) : null}
        </section>

        {draft ? (
          <aside className={styles.side} aria-label="Campos">
            <section className={styles.sideSection}>
              <span className={ex.paneKicker}>Seleção no exemplo</span>
              {view !== "sample" ? (
                <p className={ex.paneHint}>Volte para o exemplo para selecionar textos.</p>
              ) : selectedWords.length === 0 && !lastRect ? (
                <p className={ex.paneHint}>
                  Clique nas palavras (Shift soma) ou arraste um retângulo. Com o retângulo você também pode criar uma máscara de área (todo o texto
                  dentro dele).
                </p>
              ) : selectedWords.length === 0 && lastRect ? (
                <div className={ex.paneActions}>
                  <button type="button" className={ex.primaryBtn} onClick={createAreaField} data-testid="ocr-create-area">
                    <Icon name="viewTiles" size={14} /> Criar máscara de área
                  </button>
                  <button type="button" className={ex.linkBtn} onClick={() => setLastRect(null)}>
                    Limpar
                  </button>
                </div>
              ) : (
                <>
                  <code className={styles.selectionText} data-testid="ocr-selection-text">
                    {selectionText}
                  </code>
                  <div className={ex.paneActions}>
                    <button type="button" className={ex.primaryBtn} onClick={createFieldFromSelection} data-testid="ocr-create-field">
                      <Icon name="plus" size={14} /> Criar campo
                    </button>
                    {lastRect ? (
                      <button
                        type="button"
                        className={ex.secondaryBtn}
                        onClick={createAreaField}
                        data-testid="ocr-create-area"
                        title="Todo o texto dentro do retângulo, com as quebras de linha"
                      >
                        <Icon name="viewTiles" size={14} /> Criar máscara de área
                      </button>
                    ) : null}
                    {activeField ? (
                      <>
                        <button
                          type="button"
                          className={ex.secondaryBtn}
                          onClick={() => {
                            const box = unionBox(selectedWords.map((word) => word.box));
                            if (box) patchField(activeField.id, { region: { ...box, page: selectedWords[0].page }, sampleText: selectionText });
                            setSelected(new Set());
                          }}
                        >
                          Usar como posição de “{activeField.label}”
                        </button>
                        <button
                          type="button"
                          className={ex.secondaryBtn}
                          onClick={() => {
                            patchField(activeField.id, { wildcards: [...activeField.wildcards, { kind: "after_label", label: selectionText }] });
                            setSelected(new Set());
                          }}
                        >
                          Usar como rótulo
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className={ex.secondaryBtn}
                      onClick={() => {
                        addAnchor({ kind: "text", value: selectionText });
                        setSelected(new Set());
                      }}
                      title="O documento precisa conter este texto"
                    >
                      Usar como âncora
                    </button>
                    <button type="button" className={ex.linkBtn} onClick={() => setSelected(new Set())}>
                      Limpar
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className={styles.sideSection} data-testid="ocr-anchors">
              <span className={ex.paneKicker}>Âncoras — o documento precisa conter</span>
              <p className={ex.paneHint}>Se faltar alguma, o upload é cancelado e nada é gravado (evita registrar dados do veículo errado).</p>
              {draft.anchors.length === 0 ? <p className={ex.paneHint}>Sem âncoras: qualquer documento passa.</p> : null}
              <div className={styles.fieldList}>
                {draft.anchors.map((anchor, position) => {
                  const result = anchorResults?.[position];
                  const noVehicle = anchor.kind === "vehicle" && !anchorVehicleContext.placa;
                  return (
                    <div key={position} className={styles.anchorRow} data-status={noVehicle ? "pending" : (result?.status ?? "pending")}>
                      <span className={styles.anchorStatus}>
                        {noVehicle ? "•" : result?.status === "ok" ? "✓" : result?.status === "missing" ? "✗" : "–"}
                      </span>
                      <span className={styles.anchorMain}>
                        <strong>{anchorLabel(anchor)}</strong>
                        <small>
                          {noVehicle
                            ? "Conferido com a pasta de destino no upload."
                            : result?.status === "ok"
                              ? `Presente${anchor.kind === "vehicle" && result.expected ? ` (${String(result.expected).toUpperCase()})` : ""}.`
                              : result?.status === "missing"
                                ? `Ausente neste documento${anchor.kind === "vehicle" && result.expected ? ` (esperado ${String(result.expected).toUpperCase()})` : ""} — seria cancelado.`
                                : result?.status === "skipped"
                                  ? "Veículo sem esse dado cadastrado — não conferido."
                                  : "—"}
                        </small>
                      </span>
                      <button
                        type="button"
                        className={ex.iconBtn}
                        onClick={() => patch((current) => ({ ...current, anchors: current.anchors.filter((_, index) => index !== position) }))}
                        aria-label="Remover âncora"
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className={ex.paneActions}>
                <select
                  className={styles.addRule}
                  value=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "text") setTextAnchor("");
                    else if (value) addAnchor({ kind: "vehicle", field: value as OcrAnchorVehicleField });
                  }}
                  data-testid="ocr-add-anchor"
                >
                  <option value="">+ Adicionar âncora…</option>
                  {VEHICLE_ANCHORS.map((option) => (
                    <option key={option.field} value={option.field}>
                      {option.label}
                    </option>
                  ))}
                  <option value="text">Texto fixo…</option>
                </select>
              </div>
              {textAnchor !== null ? (
                <form
                  className={ex.paneActions}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (textAnchor.trim()) addAnchor({ kind: "text", value: textAnchor.trim() });
                    setTextAnchor(null);
                  }}
                >
                  <input
                    autoFocus
                    className={styles.addRule}
                    value={textAnchor}
                    onChange={(event) => setTextAnchor(event.target.value)}
                    placeholder="ex.: CERTIFICADO DE REGISTRO"
                  />
                  <button type="submit" className={ex.secondaryBtn}>
                    Adicionar
                  </button>
                </form>
              ) : null}
            </section>

            <section className={styles.sideSection}>
              <div className={styles.sideHead}>
                <span className={ex.paneKicker}>Campos ({draft.fields.length})</span>
                <button type="button" className={ex.linkBtn} onClick={createWildcardField} title="Campo sem posição, só com regras coringa">
                  + Campo coringa
                </button>
              </div>
              {draft.fields.length === 0 ? <p className={ex.paneHint}>Nenhum campo. Selecione um texto no exemplo e clique em “Criar campo”.</p> : null}
              <div className={styles.fieldList}>
                {draft.fields.map((field) => {
                  const result = resultByField.get(field.id);
                  return (
                    <button
                      key={field.id}
                      type="button"
                      className={`${styles.fieldItem} ${field.id === activeFieldId ? styles.fieldItemActive : ""}`}
                      onClick={() => setActiveFieldId(field.id === activeFieldId ? null : field.id)}
                      data-testid="ocr-field"
                    >
                      <span className={styles.fieldTop}>
                        <strong>{field.label}</strong>
                        <span className={styles.badge} data-source={result?.source ?? "none"}>
                          {result?.source === "region" ? (field.mode === "area" ? "área" : "posição") : result?.source === "wildcard" ? "coringa" : "não achou"}
                        </span>
                      </span>
                      <small>→ {destinationFor(field.destination).label}</small>
                      <code data-testid="ocr-field-value" className={field.mode === "area" ? styles.areaValue : undefined}>
                        {result?.value ?? "—"}
                      </code>
                    </button>
                  );
                })}
              </div>
            </section>

            {activeField ? (
              <FieldEditor
                field={activeField}
                catalog={catalog}
                documentTypeKey={draft?.documentTypeKey ?? null}
                rect={lastRect}
                onUseRect={() => {
                  if (!lastRect || !draft?.sampleDocument) return;
                  patchField(activeField.id, {
                    region: lastRect,
                    sampleText: joinLines(wordsInRegion(draft.sampleDocument, lastRect, true))
                  });
                  setLastRect(null);
                }}
                onChange={(change) => patchField(activeField.id, change)}
                onRemove={() => {
                  patch((current) => ({ ...current, fields: current.fields.filter((field) => field.id !== activeField.id) }));
                  setActiveFieldId(null);
                }}
              />
            ) : null}
          </aside>
        ) : null}
      </div>

      {picker ? (
        <OcrFilePicker
          model={model}
          title={picker === "sample" ? "Documento de exemplo" : "Testar o template em…"}
          onClose={() => setPicker(null)}
          onPickExplorer={(file) => {
            if (picker === "sample") void pickExplorerSample(file);
            else
              void blobForExplorerFile(file).then(
                (blob) => runTest(blob, file.id),
                (error: unknown) => notify("error", error instanceof Error ? error.message : "Falha ao baixar.")
              );
          }}
          onPickLocal={(file) => {
            if (picker === "sample") void pickLocalSample(file);
            else void runTest(file);
          }}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title="Excluir template"
          message={`Excluir o template “${draft?.name}”? Uploads deste tipo voltam ao comportamento padrão.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => void remove()}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}

function WildcardEditor({ wildcard, onChange, onRemove }: { wildcard: OcrWildcard; onChange: (next: OcrWildcard) => void; onRemove: () => void }) {
  let control: ReactNode = null;
  switch (wildcard.kind) {
    case "length":
      control = (
        <span className={styles.inline}>
          de
          <input type="number" min={0} value={wildcard.min} onChange={(event) => onChange({ ...wildcard, min: Number(event.target.value) })} />
          a
          <input type="number" min={0} value={wildcard.max} onChange={(event) => onChange({ ...wildcard, max: Number(event.target.value) })} />
        </span>
      );
      break;
    case "charset":
      control = (
        <select value={wildcard.set} onChange={(event) => onChange({ ...wildcard, set: event.target.value as "digits" | "letters" | "alnum" })}>
          <option value="digits">Só dígitos</option>
          <option value="letters">Só letras</option>
          <option value="alnum">Letras e dígitos</option>
        </select>
      );
      break;
    case "mask":
      control = <input value={wildcard.mask} onChange={(event) => onChange({ ...wildcard, mask: event.target.value })} placeholder="AAA9A99" title="9 = dígito, A = letra, * = qualquer" />;
      break;
    case "after_label":
      control = <input value={wildcard.label} onChange={(event) => onChange({ ...wildcard, label: event.target.value })} placeholder="ex.: RENAVAM" />;
      break;
    case "regex":
      control = <input value={wildcard.source} onChange={(event) => onChange({ ...wildcard, source: event.target.value })} placeholder="^\d{11}$" />;
      break;
    default:
      control = <input value={wildcard.value} onChange={(event) => onChange({ ...wildcard, value: event.target.value } as OcrWildcard)} />;
  }
  return (
    <div className={styles.wildcard}>
      <span className={styles.wildcardLabel}>{WILDCARD_LABELS[wildcard.kind]}</span>
      {control}
      <button type="button" className={ex.iconBtn} onClick={onRemove} aria-label="Remover regra">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

function FieldEditor({
  field,
  catalog,
  documentTypeKey,
  rect,
  onUseRect,
  onChange,
  onRemove
}: {
  field: OcrField;
  catalog: OcrCatalogTable[] | null;
  documentTypeKey: string | null;
  rect: { page: number } | null;
  onUseRect: () => void;
  onChange: (change: Partial<OcrField>) => void;
  onRemove: () => void;
}) {
  const isArea = field.mode === "area";
  const upper = field.transforms.includes("upper");
  const charset = field.transforms.includes("digits_only") ? "digits_only" : field.transforms.includes("alnum_only") ? "alnum_only" : "all";
  const noSpaces = field.transforms.includes("no_spaces");
  return (
    <section className={styles.sideSection} data-testid="ocr-field-editor">
      <div className={styles.sideHead}>
        <span className={ex.paneKicker}>Campo</span>
        <button type="button" className={`${ex.linkBtn} ${ex.dangerText}`} onClick={onRemove}>
          Remover campo
        </button>
      </div>
      <label className={ex.field}>
        <span>Nome</span>
        <input value={field.label} onChange={(event) => onChange({ label: event.target.value })} />
      </label>
      <div className={ex.field}>
        <span>Tipo</span>
        <div className={ex.chips}>
          <button type="button" className={`${ex.chip} ${!isArea ? ex.chipOn : ""}`} onClick={() => onChange({ mode: "value" })}>
            Valor
          </button>
          <button
            type="button"
            className={`${ex.chip} ${isArea ? ex.chipOn : ""}`}
            onClick={() => onChange({ mode: "area" })}
            title="Todo o texto dentro da área, com quebras de linha"
            data-testid="ocr-field-mode-area"
          >
            Máscara de área
          </button>
        </div>
        <small>{isArea ? "Pega todo o texto dentro do retângulo, linha a linha. Só posição — não busca no resto do documento." : "Um valor achado na posição do exemplo ou pelas regras coringa."}</small>
      </div>
      <div className={ex.field}>
        <span>Destino do registro</span>
        <DestinationPicker
          value={field.destination}
          catalog={catalog}
          documentTypeKey={documentTypeKey}
          onChange={(destination) => onChange({ destination })}
        />
      </div>
      <label className={ex.toggleRow}>
        <input type="checkbox" checked={field.required} onChange={(event) => onChange({ required: event.target.checked })} />
        <span>
          <strong>Obrigatório</strong>
          <small>Sem ele o arquivo é recusado (trava) ou a gravação fica bloqueada.</small>
        </span>
      </label>
      <div className={ex.field}>
        <span>{isArea ? "Área no exemplo" : "Posição no exemplo"}</span>
        {rect ? (
          <button type="button" className={ex.linkBtn} onClick={onUseRect} data-testid="ocr-use-rect">
            Usar o retângulo desenhado como {isArea ? "área" : "posição"}
          </button>
        ) : null}
        {field.region ? (
          <small>
            Página {field.region.page + 1} · “{(field.sampleText || "—").replace(/\n/g, " ⏎ ")}”{" "}
            {isArea ? null : (
              <button type="button" className={ex.linkBtn} onClick={() => onChange({ region: null })}>
                tirar posição (só coringa)
              </button>
            )}
          </small>
        ) : (
          <small>Sem posição: o valor é buscado no documento inteiro pelas regras coringa.</small>
        )}
      </div>
      <div className={ex.field}>
        <span>Ajustes do texto</span>
        <div className={ex.chips}>
          <button
            type="button"
            className={`${ex.chip} ${upper ? ex.chipOn : ""}`}
            onClick={() => onChange({ transforms: buildTransforms({ upper: !upper, charset, noSpaces }) })}
            aria-pressed={upper}
            data-testid="ocr-transform-upper"
          >
            MAIÚSCULAS
          </button>
          {charset === "all" ? (
            <button
              type="button"
              className={`${ex.chip} ${noSpaces ? ex.chipOn : ""}`}
              onClick={() => onChange({ transforms: buildTransforms({ upper, charset, noSpaces: !noSpaces }) })}
              aria-pressed={noSpaces}
              data-testid="ocr-transform-no-spaces"
            >
              Sem espaços
            </button>
          ) : null}
        </div>
        <div className={ex.chips} role="radiogroup" aria-label="Caracteres">
          {CHARSET_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={charset === option.value}
              className={`${ex.chip} ${charset === option.value ? ex.chipOn : ""}`}
              onClick={() => onChange({ transforms: buildTransforms({ upper, charset: option.value, noSpaces }) })}
              data-testid={`ocr-transform-charset-${option.value}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <small>Espaços repetidos e nas pontas sempre saem. Letras e dígitos / Só dígitos já tiram os espaços.</small>
      </div>
      <div className={ex.field}>
        <span>{isArea ? "Regras de validação" : "Regras coringa"}</span>
        <small>
          {isArea
            ? "Opcional: se alguma não valer, o campo fica inválido."
            : "Todas precisam valer. Também são usadas para achar o valor quando a posição do exemplo não bate."}
        </small>
        {field.wildcards.map((wildcard, index) => (
          <WildcardEditor
            key={index}
            wildcard={wildcard}
            onChange={(next) => onChange({ wildcards: field.wildcards.map((entry, position) => (position === index ? next : entry)) })}
            onRemove={() => onChange({ wildcards: field.wildcards.filter((_, position) => position !== index) })}
          />
        ))}
        <div className={ex.paneActions}>
          <select
            className={styles.addRule}
            value=""
            onChange={(event) => {
              const kind = event.target.value as OcrWildcardKind;
              if (kind) onChange({ wildcards: [...field.wildcards, newWildcard(kind, applyTransforms(field.sampleText, field.transforms))] });
            }}
            data-testid="ocr-add-wildcard"
          >
            <option value="">+ Adicionar regra…</option>
            {(Object.keys(WILDCARD_LABELS) as OcrWildcardKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {WILDCARD_LABELS[kind]}
              </option>
            ))}
          </select>
          {field.sampleText ? (
            <button type="button" className={ex.linkBtn} onClick={() => onChange({ wildcards: suggestWildcards(applyTransforms(field.sampleText, field.transforms)) })}>
              Sugerir pelo exemplo
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
