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
import { invalidateOcrTemplates, loadOcrTemplates } from "@/components/files/ocr/use-ocr";
import type { RequestAuth } from "@/components/ui-grid/types";
import { getOcrDestination, OCR_DESTINATIONS } from "@/lib/domain/ocr/destinations";
import { applyTransforms, extractTemplate, joinWords, suggestWildcards, unionBox } from "@/lib/domain/ocr/engine";
import type { OcrTemplateInput } from "@/lib/domain/ocr/schemas";
import {
  OCR_TRANSFORMS,
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

const TRANSFORM_LABELS: Record<OcrTransform, string> = {
  trim: "Limpar espaços",
  upper: "MAIÚSCULAS",
  digits_only: "Só dígitos",
  alnum_only: "Só letras e dígitos",
  no_spaces: "Sem espaços"
};

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
    fields: []
  };
}

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
  const [test, setTest] = useState<{ name: string; document: OcrDocument; pages: RenderedPage[] } | null>(null);
  const [view, setView] = useState<"sample" | "test">("sample");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [railOpen, setRailOpen] = useState(true);

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
          fields: template.fields
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

  const runTest = async (file: Blob & { name?: string }) => {
    setProgress("Lendo o documento de teste…");
    try {
      const result = await readDocument(file, { renderPages: true, onProgress: setProgress });
      setTest({ name: file.name ?? "documento", document: result.document, pages: result.pages });
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

  const createFieldFromSelection = () => {
    if (!draft || selectedWords.length === 0) return;
    const box = unionBox(selectedWords.map((word) => word.box));
    if (!box) return;
    const pad = 0.004;
    const text = selectionText;
    const destination = guessDestination(text);
    const transforms: OcrTransform[] = destination === "none" ? ["trim"] : ["trim", "upper"];
    const field: OcrField = {
      id: localId(),
      label: destination === "none" ? `Campo ${draft.fields.length + 1}` : getOcrDestination(destination).label.replace(/ \(.*\)$/, ""),
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

  const createWildcardField = () => {
    if (!draft) return;
    const field: OcrField = {
      id: localId(),
      label: `Coringa ${draft.fields.length + 1}`,
      destination: "none",
      region: null,
      sampleText: "",
      transforms: ["trim"],
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
                            className={`${styles.region} ${field.id === activeFieldId ? styles.regionActive : ""}`}
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
              ) : selectedWords.length === 0 ? (
                <p className={ex.paneHint}>Clique nas palavras (Shift soma) ou arraste um retângulo sobre o texto que quer registrar.</p>
              ) : (
                <>
                  <code className={styles.selectionText} data-testid="ocr-selection-text">
                    {selectionText}
                  </code>
                  <div className={ex.paneActions}>
                    <button type="button" className={ex.primaryBtn} onClick={createFieldFromSelection} data-testid="ocr-create-field">
                      <Icon name="plus" size={14} /> Criar campo
                    </button>
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
                    <button type="button" className={ex.linkBtn} onClick={() => setSelected(new Set())}>
                      Limpar
                    </button>
                  </div>
                </>
              )}
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
                          {result?.source === "region" ? "posição" : result?.source === "wildcard" ? "coringa" : "não achou"}
                        </span>
                      </span>
                      <small>→ {getOcrDestination(field.destination).label}</small>
                      <code data-testid="ocr-field-value">{result?.value ?? "—"}</code>
                    </button>
                  );
                })}
              </div>
            </section>

            {activeField ? (
              <FieldEditor
                field={activeField}
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
            else void blobForExplorerFile(file).then(runTest, (error: unknown) => notify("error", error instanceof Error ? error.message : "Falha ao baixar."));
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

function FieldEditor({ field, onChange, onRemove }: { field: OcrField; onChange: (change: Partial<OcrField>) => void; onRemove: () => void }) {
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
      <label className={ex.field}>
        <span>Destino do registro</span>
        <select value={field.destination} onChange={(event) => onChange({ destination: event.target.value })} data-testid="ocr-field-destination">
          {OCR_DESTINATIONS.map((destination) => (
            <option key={destination.key} value={destination.key}>
              {destination.label}
            </option>
          ))}
        </select>
      </label>
      <label className={ex.toggleRow}>
        <input type="checkbox" checked={field.required} onChange={(event) => onChange({ required: event.target.checked })} />
        <span>
          <strong>Obrigatório</strong>
          <small>Sem ele o arquivo é recusado (trava) ou a gravação fica bloqueada.</small>
        </span>
      </label>
      <div className={ex.field}>
        <span>Posição no exemplo</span>
        {field.region ? (
          <small>
            Página {field.region.page + 1} · “{field.sampleText || "—"}”{" "}
            <button type="button" className={ex.linkBtn} onClick={() => onChange({ region: null })}>
              tirar posição (só coringa)
            </button>
          </small>
        ) : (
          <small>Sem posição: o valor é buscado no documento inteiro pelas regras coringa.</small>
        )}
      </div>
      <div className={ex.field}>
        <span>Ajustes do texto</span>
        <div className={ex.chips}>
          {OCR_TRANSFORMS.map((transform) => {
            const on = field.transforms.includes(transform);
            return (
              <button
                key={transform}
                type="button"
                className={`${ex.chip} ${on ? ex.chipOn : ""}`}
                onClick={() => onChange({ transforms: on ? field.transforms.filter((entry) => entry !== transform) : [...field.transforms, transform] })}
              >
                {TRANSFORM_LABELS[transform]}
              </button>
            );
          })}
        </div>
      </div>
      <div className={ex.field}>
        <span>Regras coringa</span>
        <small>Todas precisam valer. Também são usadas para achar o valor quando a posição do exemplo não bate.</small>
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
