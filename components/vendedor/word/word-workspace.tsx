"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
export function WordWorkspace({
  authOverride,
  initialVendaId = null
}: { authOverride?: RequestAuth; initialVendaId?: string | null } = {}) {
  const sessionAuth = useVendedorAuth();
  const auth = authOverride ?? sessionAuth;
  const router = useRouter();
  const { actor } = useAuthSessionState();
  const role = actor?.role;
  const isAdmin = role === "ADMINISTRADOR";
  const canManageTemplates = role === "GERENTE" || role === "ADMINISTRADOR";

  const PAGE_SIZE = 50;
  const [processos, setProcessos] = useState<ProcessoVeiculo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [templates, setTemplates] = useState<DocumentoTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [navOpen, setNavOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(true);
  const [placasOpen, setPlacasOpen] = useState(true);

  // Seleção é por CARRO (há placas sem venda); a venda é derivada do processo.
  const [selCarroId, setSelCarroId] = useState<string | null>(null);
  const [selDocId, setSelDocId] = useState<string | null>(null);
  const [docState, setDocState] = useState<{ doc: VendaDocumentoRow; contexto: VendaDocContext } | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [galleryRefresh, setGalleryRefresh] = useState(0);

  const [pickerVendaId, setPickerVendaId] = useState<string | null>(null);
  const [manager, setManager] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null });

  // Alvos dos portais do documento aberto (linha de titulo e ribbon na barra).
  const [barHeadEl, setBarHeadEl] = useState<HTMLDivElement | null>(null);
  const [barRibbonEl, setBarRibbonEl] = useState<HTMLDivElement | null>(null);
  const placaSentinelRef = useRef<HTMLDivElement | null>(null);

  const loadProcessos = useCallback(
    async (nextPage: number, query: string) => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchProcessos(auth, { page: nextPage, pageSize: PAGE_SIZE, q: query });
        setProcessos((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
        setPage(nextPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar processos.");
      } finally {
        setLoading(false);
      }
    },
    [auth]
  );

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await fetchTemplates(auth));
    } catch {
      // Lista de templates e auxiliar na navegacao — falha nao bloqueia o resto.
      setTemplates([]);
    }
  }, [auth]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // Debounce da busca (placa/modelo/nome, server-side).
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  // Recarrega a 1a pagina ao mudar a busca.
  useEffect(() => {
    void loadProcessos(1, debouncedQ);
  }, [debouncedQ, loadProcessos]);

  // Scroll infinito da lista de placas.
  useEffect(() => {
    const el = placaSentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadProcessos(page + 1, debouncedQ);
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, debouncedQ, loadProcessos]);

  // Deep-link ?venda=<id> (vindo de "Gerar documentos" ao fechar a ficha):
  // seleciona a placa do processo e abre a navegação. Roda uma vez, quando os
  // processos chegam e o id está presente entre eles.
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (deepLinkDoneRef.current || !initialVendaId) return;
    const alvo = processos.find((p) => p.vendaId === initialVendaId);
    if (alvo) {
      deepLinkDoneRef.current = true;
      setSelCarroId(alvo.carroId);
      setNavOpen(true);
      return;
    }
    // Ainda não carregado: pagina até achar (ou esgotar).
    if (loading) return;
    if (hasMore) void loadProcessos(page + 1, debouncedQ);
    else deepLinkDoneRef.current = true;
  }, [initialVendaId, processos, hasMore, loading, page, debouncedQ, loadProcessos]);

  const openDocument = useCallback(
    async (vendaId: string, docId: string) => {
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

  function selectPlaca(carroId: string) {
    setSelCarroId(carroId);
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
      await loadProcessos(1, debouncedQ);
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
      await loadProcessos(1, debouncedQ);
      setGalleryRefresh((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir documento.");
    }
  }

  async function handleToggleFinalize(vendaId: string, finalizado: boolean) {
    try {
      if (finalizado) await reabrirProcesso(auth, vendaId);
      else await finalizarProcesso(auth, vendaId);
      await loadProcessos(1, debouncedQ);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar o processo.");
    }
  }

  async function handleDeleteProcesso(vendaId: string) {
    if (!window.confirm("Excluir o PROCESSO de venda e TODOS os seus documentos? Acao irreversivel.")) return;
    try {
      await deleteProcesso(auth, vendaId);
      setSelDocId(null);
      setDocState(null);
      await loadProcessos(1, debouncedQ);
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

  const selProcesso = processos.find((p) => p.carroId === selCarroId) ?? null;
  const selVendaId = selProcesso?.vendaId ?? null;
  const docOpen = Boolean(docState && selDocId);

  const ESTAGIO_BADGE: Record<string, string> = {
    aberto: "Aberto",
    fechado: "Fechado",
    na_garantia: "Garantia",
    finalizado: "Finalizado"
  };

  function renderPlaca(p: ProcessoVeiculo) {
    // Vermelho: venda fechada (entregue) que ainda nao tem nenhum documento.
    const pendenteDoc = p.estagio === "fechado" && p.documentos.length === 0;
    const semProcesso = !p.vendaId;
    return (
      <li key={p.carroId}>
        <button
          type="button"
          className={`word-placa ${selCarroId === p.carroId ? "is-active" : ""} ${pendenteDoc ? "is-pendente-doc" : ""}`.trim()}
          onClick={() => selectPlaca(p.carroId)}
          aria-pressed={selCarroId === p.carroId}
          title={pendenteDoc ? "Venda fechada sem documento" : undefined}
        >
          <span className="word-proc-top">
            <span className="word-proc-placa">{p.placa}</span>
            {p.estagio ? (
              <span className={`word-estagio-tag is-${p.estagio}`}>{ESTAGIO_BADGE[p.estagio] ?? p.estagio}</span>
            ) : semProcesso ? (
              <span className="word-estagio-tag is-sem">Sem venda</span>
            ) : null}
            {!semProcesso ? <span className="word-proc-count">{p.documentos.length}</span> : null}
          </span>
          <span className="word-proc-modelo">{p.modelo ?? "—"}</span>
          {p.nome ? <span className="word-proc-nome">{p.nome}</span> : null}
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
              <span className="word-bar-sub">{selProcesso.modelo ?? selProcesso.nome ?? "—"}</span>
              {selProcesso.finalizado ? <span className="word-status-badge">Finalizado</span> : null}
              <div className="word-bar-spacer" />
              {selVendaId ? (
                <>
                  <button
                    type="button"
                    className="word-action-btn is-primary"
                    onClick={() => setPickerVendaId(selVendaId)}
                  >
                    + Novo documento
                  </button>
                  <button
                    type="button"
                    className="word-action-btn"
                    onClick={() => void handleToggleFinalize(selVendaId, selProcesso.finalizado)}
                  >
                    {selProcesso.finalizado ? "Reabrir" : "Finalizar"}
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      className="word-action-btn is-danger"
                      onClick={() => void handleDeleteProcesso(selVendaId)}
                    >
                      Excluir processo
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="word-bar-sub">Sem processo de venda</span>
              )}
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
                    {processos.length === 0 && !loading ? (
                      <p className="word-hint">{debouncedQ ? "Nenhuma placa encontrada." : "Nenhuma placa."}</p>
                    ) : (
                      <ul className="word-placa-list">{processos.map(renderPlaca)}</ul>
                    )}
                    {loading ? <p className="word-hint">Carregando...</p> : null}
                    {hasMore ? <div ref={placaSentinelRef} className="word-placa-sentinel" aria-hidden="true" /> : null}
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
          ) : selProcesso && selVendaId ? (
            <DocumentGallery
              key={selVendaId}
              auth={auth}
              processo={selProcesso}
              refreshKey={galleryRefresh}
              onOpen={(docId) => void openDocument(selVendaId, docId)}
              onNew={() => setPickerVendaId(selVendaId)}
              onDeleteDoc={(docId) => void handleDeleteDoc(docId)}
            />
          ) : selProcesso ? (
            <div className="word-empty">
              <p>
                <strong>{selProcesso.placa}</strong> {selProcesso.modelo ?? selProcesso.nome ?? ""} ainda não tem
                processo de venda — gere os documentos depois de registrar a venda.
              </p>
              <button type="button" className="word-action-btn is-primary" onClick={() => router.push(`/vendedor/vender?carro=${selProcesso.carroId}`)}>
                Registrar venda
              </button>
            </div>
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
