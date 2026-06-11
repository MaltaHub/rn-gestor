"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { RequestAuth } from "@/components/ui-grid/types";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { useAuthSessionState } from "@/components/auth/auth-provider";
import type { ProcessoVeiculo } from "@/lib/domain/venda-documentos/service";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/variables";
import type { DocumentoTemplateRow, VendaDocumentoRow } from "@/lib/domain/db";
import { EMPTY_DOC } from "@/components/vendedor/word/tiptap-config";
import {
  createDocumento,
  deleteDocumento,
  deleteProcesso,
  fetchDocumento,
  fetchProcessos,
  fetchTemplates,
  fetchVendaDocContext,
  finalizarProcesso,
  reabrirProcesso
} from "@/components/vendedor/word/api";
import { WordEditor } from "@/components/vendedor/word/word-editor";
import { DocumentGallery } from "@/components/vendedor/word/document-gallery";
import { TemplatePicker } from "@/components/vendedor/word/template-picker";
import { TemplateManager } from "@/components/vendedor/word/template-manager";

/**
 * Workspace do editor Word, em tela cheia (estilo Word/clean):
 *  - BARRA FIXA de ponta a ponta no topo (2 linhas: contexto/acoes + ribbon);
 *  - barra vertical ESQUERDA colapsada (rail) com Templates antes das Placas;
 *  - palco central: galeria de miniaturas da placa -> editor do documento.
 * O conteudo do cabecalho/ribbon do documento entra na barra via portal
 * (word-editor.tsx / word-surface.tsx).
 */
export function WordWorkspace({ authOverride }: { authOverride?: RequestAuth } = {}) {
  const sessionAuth = useVendedorAuth();
  const auth = authOverride ?? sessionAuth;
  const { actor } = useAuthSessionState();
  const role = actor?.role;
  const isAdmin = role === "ADMINISTRADOR";
  const canManageTemplates = role === "GERENTE" || role === "ADMINISTRADOR";

  const [processos, setProcessos] = useState<ProcessoVeiculo[]>([]);
  const [templates, setTemplates] = useState<DocumentoTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [navOpen, setNavOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(true);
  const [placasOpen, setPlacasOpen] = useState(true);

  const [selVendaId, setSelVendaId] = useState<string | null>(null);
  const [selDocId, setSelDocId] = useState<string | null>(null);
  const [docState, setDocState] = useState<{ doc: VendaDocumentoRow; contexto: VendaDocContext } | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [galleryRefresh, setGalleryRefresh] = useState(0);

  const [pickerVendaId, setPickerVendaId] = useState<string | null>(null);
  const [manager, setManager] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null });

  // Alvos dos portais do documento aberto (linha de titulo e ribbon na barra).
  const [barHeadEl, setBarHeadEl] = useState<HTMLDivElement | null>(null);
  const [barRibbonEl, setBarRibbonEl] = useState<HTMLDivElement | null>(null);

  const loadProcessos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProcessos(await fetchProcessos(auth));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar processos.");
    } finally {
      setLoading(false);
    }
  }, [auth]);

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await fetchTemplates(auth));
    } catch {
      // Lista de templates e auxiliar na navegacao — falha nao bloqueia o resto.
      setTemplates([]);
    }
  }, [auth]);

  useEffect(() => {
    void loadProcessos();
    void loadTemplates();
  }, [loadProcessos, loadTemplates]);

  const openDocument = useCallback(
    async (vendaId: string, docId: string) => {
      setSelVendaId(vendaId);
      setSelDocId(docId);
      setDocLoading(true);
      setDocState(null);
      try {
        const [doc, contexto] = await Promise.all([
          fetchDocumento(auth, docId),
          fetchVendaDocContext(auth, vendaId)
        ]);
        setDocState({ doc, contexto });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao abrir documento.");
        setSelDocId(null);
      } finally {
        setDocLoading(false);
      }
    },
    [auth]
  );

  function selectPlaca(vendaId: string) {
    setSelVendaId(vendaId);
    setSelDocId(null);
    setDocState(null);
  }

  function backToGallery() {
    setSelDocId(null);
    setDocState(null);
    setGalleryRefresh((k) => k + 1);
  }

  async function handleCreate(vendaId: string, template: DocumentoTemplateRow | null) {
    setPickerVendaId(null);
    try {
      const titulo = template ? template.titulo : "Novo documento";
      const conteudo = (template?.conteudo as JSONContent | undefined) ?? EMPTY_DOC;
      const doc = await createDocumento(auth, {
        venda_id: vendaId,
        titulo,
        conteudo,
        template_id: template?.id ?? null
      });
      await loadProcessos();
      void openDocument(vendaId, doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar documento.");
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!window.confirm("Excluir este documento?")) return;
    try {
      await deleteDocumento(auth, docId);
      if (selDocId === docId) {
        setSelDocId(null);
        setDocState(null);
      }
      await loadProcessos();
      setGalleryRefresh((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir documento.");
    }
  }

  async function handleToggleFinalize(vendaId: string, finalizado: boolean) {
    try {
      if (finalizado) await reabrirProcesso(auth, vendaId);
      else await finalizarProcesso(auth, vendaId);
      await loadProcessos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar o processo.");
    }
  }

  async function handleDeleteProcesso(vendaId: string) {
    if (!window.confirm("Excluir o PROCESSO de venda e TODOS os seus documentos? Acao irreversivel.")) return;
    try {
      await deleteProcesso(auth, vendaId);
      if (selVendaId === vendaId) {
        setSelVendaId(null);
        setSelDocId(null);
        setDocState(null);
      }
      await loadProcessos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir processo.");
    }
  }

  const onSaved = useCallback(({ id, titulo }: { id: string; titulo: string }) => {
    setProcessos((prev) =>
      prev.map((p) => ({
        ...p,
        documentos: p.documentos.map((d) => (d.id === id ? { ...d, titulo } : d))
      }))
    );
  }, []);

  function closeManager() {
    setManager({ open: false, editId: null });
    void loadTemplates();
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return processos;
    return processos.filter(
      (p) => p.placa.toLowerCase().includes(needle) || (p.modelo ?? "").toLowerCase().includes(needle)
    );
  }, [processos, q]);

  const emAndamento = filtered.filter((p) => !p.finalizado);
  const finalizados = filtered.filter((p) => p.finalizado);
  const selProcesso = processos.find((p) => p.vendaId === selVendaId) ?? null;
  const docOpen = Boolean(docState && selDocId);

  function renderPlaca(p: ProcessoVeiculo) {
    return (
      <li key={p.vendaId}>
        <button
          type="button"
          className={`word-placa ${selVendaId === p.vendaId ? "is-active" : ""}`.trim()}
          onClick={() => selectPlaca(p.vendaId)}
          aria-pressed={selVendaId === p.vendaId}
        >
          <span className="word-proc-placa">{p.placa}</span>
          <span className="word-proc-modelo">{p.modelo ?? "—"}</span>
          <span className="word-proc-count">{p.documentos.length}</span>
        </button>
      </li>
    );
  }

  return (
    <section className="word-app">
      {/* Barra fixa de ponta a ponta (linha 1: contexto/acoes; linha 2: ribbon). */}
      <div className="word-bar">
        <div className="word-bar-head">
          <button
            type="button"
            className="word-icon-btn"
            onClick={() => setNavOpen((v) => !v)}
            title={navOpen ? "Recolher navegação" : "Expandir navegação"}
            aria-label={navOpen ? "Recolher navegação" : "Expandir navegação"}
            aria-expanded={navOpen}
          >
            ☰
          </button>

          {docOpen ? (
            <>
              <button
                type="button"
                className="word-icon-btn"
                onClick={backToGallery}
                title={`Voltar para os documentos de ${selProcesso?.placa ?? ""}`.trim()}
                aria-label="Voltar para a galeria"
              >
                ←
              </button>
              <span className="word-bar-chip">{selProcesso?.placa ?? "—"}</span>
              <div className="word-bar-slot" ref={setBarHeadEl} />
            </>
          ) : selProcesso ? (
            <>
              <span className="word-bar-chip">{selProcesso.placa}</span>
              <span className="word-bar-sub">{selProcesso.modelo ?? "—"}</span>
              {selProcesso.finalizado ? <span className="word-status-badge">Finalizado</span> : null}
              <div className="word-bar-spacer" />
              <button
                type="button"
                className="word-action-btn is-primary"
                onClick={() => setPickerVendaId(selProcesso.vendaId)}
              >
                + Novo documento
              </button>
              <button
                type="button"
                className="word-action-btn"
                onClick={() => void handleToggleFinalize(selProcesso.vendaId, selProcesso.finalizado)}
              >
                {selProcesso.finalizado ? "Reabrir" : "Finalizar"}
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  className="word-action-btn is-danger"
                  onClick={() => void handleDeleteProcesso(selProcesso.vendaId)}
                >
                  Excluir processo
                </button>
              ) : null}
            </>
          ) : (
            <>
              <span className="word-bar-title">Documentos</span>
              <span className="word-bar-sub">Selecione uma placa na navegação</span>
            </>
          )}
        </div>
        {/* Linha do ribbon: preenchida via portal quando ha documento aberto. */}
        <div className={`word-bar-ribbon ${docOpen ? "" : "is-empty"}`.trim()} ref={setBarRibbonEl} />
      </div>

      <div className="word-under">
        {/* Barra vertical ESQUERDA (colapsada por padrao). */}
        <aside className={`word-nav ${navOpen ? "is-open" : ""}`.trim()} aria-label="Navegação de documentos">
          {navOpen ? (
            <div className="word-nav-scroll">
              <input
                type="search"
                className="word-nav-search"
                placeholder="Buscar por placa..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar processo por placa"
              />

              {error ? <p className="word-error">{error}</p> : null}
              {loading ? <p className="word-hint">Carregando...</p> : null}

              <section className="word-side-section">
                <button
                  type="button"
                  className="word-side-section-head"
                  onClick={() => setTplOpen((v) => !v)}
                  aria-expanded={tplOpen}
                >
                  <span className="word-section-title">Templates</span>
                  <span className="word-side-caret">{tplOpen ? "▾" : "▸"}</span>
                </button>
                {tplOpen ? (
                  <div className="word-side-section-body">
                    {templates.length === 0 ? <p className="word-hint">Nenhum template ativo.</p> : null}
                    <ul className="word-tpl-list">
                      {templates.map((tpl) => (
                        <li key={tpl.id}>
                          {canManageTemplates ? (
                            <button
                              type="button"
                              className="word-tpl-item"
                              title={`Editar template "${tpl.titulo}"`}
                              onClick={() => setManager({ open: true, editId: tpl.id })}
                            >
                              <span className="word-tpl-title">{tpl.titulo}</span>
                              {tpl.descricao ? <span className="word-tpl-desc">{tpl.descricao}</span> : null}
                            </button>
                          ) : (
                            <span className="word-tpl-item is-static" title="Use ao criar um novo documento">
                              <span className="word-tpl-title">{tpl.titulo}</span>
                              {tpl.descricao ? <span className="word-tpl-desc">{tpl.descricao}</span> : null}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {canManageTemplates ? (
                      <button
                        type="button"
                        className="word-action-btn"
                        onClick={() => setManager({ open: true, editId: null })}
                      >
                        Gerenciar templates
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="word-side-section">
                <button
                  type="button"
                  className="word-side-section-head"
                  onClick={() => setPlacasOpen((v) => !v)}
                  aria-expanded={placasOpen}
                >
                  <span className="word-section-title">Placas para documentação</span>
                  <span className="word-side-caret">{placasOpen ? "▾" : "▸"}</span>
                </button>
                {placasOpen ? (
                  <div className="word-side-section-body">
                    <span className="word-side-sub">Em andamento</span>
                    {emAndamento.length === 0 && !loading ? (
                      <p className="word-hint">Nenhum processo em andamento.</p>
                    ) : (
                      <ul className="word-placa-list">{emAndamento.map(renderPlaca)}</ul>
                    )}
                    <span className="word-side-sub">Finalizados</span>
                    {finalizados.length === 0 && !loading ? (
                      <p className="word-hint">Nenhum processo finalizado.</p>
                    ) : (
                      <ul className="word-placa-list">{finalizados.map(renderPlaca)}</ul>
                    )}
                  </div>
                ) : null}
              </section>
            </div>
          ) : (
            <div className="word-rail">
              <button
                type="button"
                className="word-icon-btn"
                title="Templates"
                aria-label="Abrir seção de templates"
                onClick={() => {
                  setNavOpen(true);
                  setTplOpen(true);
                }}
              >
                📄
              </button>
              <button
                type="button"
                className="word-icon-btn"
                title="Placas para documentação"
                aria-label="Abrir seção de placas"
                onClick={() => {
                  setNavOpen(true);
                  setPlacasOpen(true);
                }}
              >
                🚗
              </button>
            </div>
          )}
        </aside>

        {/* Palco central: galeria de miniaturas ou o papel do documento. */}
        <div className="word-stage">
          {docLoading ? (
            <div className="word-empty">Carregando documento...</div>
          ) : docOpen && selDocId && docState ? (
            <WordEditor
              key={selDocId}
              auth={auth}
              documentoId={selDocId}
              initialTitulo={docState.doc.titulo}
              initialConteudo={(docState.doc.conteudo as JSONContent) ?? EMPTY_DOC}
              contexto={docState.contexto}
              onSaved={onSaved}
              barHeadEl={barHeadEl}
              barRibbonEl={barRibbonEl}
            />
          ) : selProcesso ? (
            <DocumentGallery
              key={selProcesso.vendaId}
              auth={auth}
              processo={selProcesso}
              refreshKey={galleryRefresh}
              onOpen={(docId) => void openDocument(selProcesso.vendaId, docId)}
              onNew={() => setPickerVendaId(selProcesso.vendaId)}
              onDeleteDoc={(docId) => void handleDeleteDoc(docId)}
            />
          ) : (
            <div className="word-empty">
              {error ? <p className="word-error">{error}</p> : null}
              <p>Selecione uma placa na navegação para ver os documentos do veículo.</p>
              <button type="button" className="word-action-btn is-primary" onClick={() => setNavOpen(true)}>
                Abrir navegação
              </button>
            </div>
          )}
        </div>
      </div>

      {pickerVendaId ? (
        <TemplatePicker
          auth={auth}
          onClose={() => setPickerVendaId(null)}
          onPick={(tpl) => void handleCreate(pickerVendaId, tpl)}
        />
      ) : null}

      {manager.open ? <TemplateManager auth={auth} initialEditId={manager.editId} onClose={closeManager} /> : null}
    </section>
  );
}
