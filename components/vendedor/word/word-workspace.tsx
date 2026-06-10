"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
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
  fetchVendaDocContext,
  finalizarProcesso,
  reabrirProcesso
} from "@/components/vendedor/word/api";
import { WordEditor } from "@/components/vendedor/word/word-editor";
import { TemplatePicker } from "@/components/vendedor/word/template-picker";
import { TemplateManager } from "@/components/vendedor/word/template-manager";

export function WordWorkspace() {
  const auth = useVendedorAuth();
  const { actor } = useAuthSessionState();
  const role = actor?.role;
  const isAdmin = role === "ADMINISTRADOR";
  const canManageTemplates = role === "GERENTE" || role === "ADMINISTRADOR";

  const [processos, setProcessos] = useState<ProcessoVeiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selDocId, setSelDocId] = useState<string | null>(null);
  const [docState, setDocState] = useState<{ doc: VendaDocumentoRow; contexto: VendaDocContext } | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [pickerVendaId, setPickerVendaId] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);

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

  useEffect(() => {
    void loadProcessos();
  }, [loadProcessos]);

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

  function toggleExpand(vendaId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(vendaId)) next.delete(vendaId);
      else next.add(vendaId);
      return next;
    });
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
      setExpanded((prev) => new Set(prev).add(vendaId));
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
      if (docState?.doc.venda_id === vendaId) {
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return processos;
    return processos.filter(
      (p) => p.placa.toLowerCase().includes(needle) || (p.modelo ?? "").toLowerCase().includes(needle)
    );
  }, [processos, q]);

  const emAndamento = filtered.filter((p) => !p.finalizado);
  const finalizados = filtered.filter((p) => p.finalizado);

  function renderProcesso(p: ProcessoVeiculo) {
    const isOpen = expanded.has(p.vendaId);
    return (
      <li key={p.vendaId} className="word-proc">
        <button
          type="button"
          className={`word-proc-head ${isOpen ? "is-open" : ""}`.trim()}
          onClick={() => toggleExpand(p.vendaId)}
          aria-expanded={isOpen}
        >
          <span className="word-proc-placa">{p.placa}</span>
          <span className="word-proc-modelo">{p.modelo ?? "—"}</span>
          <span className="word-proc-count">{p.documentos.length}</span>
        </button>
        {isOpen ? (
          <div className="word-proc-body">
            {p.documentos.length === 0 ? (
              <p className="word-proc-empty">Nenhum documento ainda.</p>
            ) : (
              <ul className="word-doc-list">
                {p.documentos.map((d) => (
                  <li key={d.id} className={`word-doc ${selDocId === d.id ? "is-active" : ""}`.trim()}>
                    <button type="button" className="word-doc-open" onClick={() => void openDocument(p.vendaId, d.id)}>
                      {d.titulo}
                    </button>
                    <button
                      type="button"
                      className="word-doc-del"
                      title="Excluir documento"
                      aria-label="Excluir documento"
                      onClick={() => void handleDeleteDoc(d.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="word-proc-actions">
              <button type="button" className="word-action-btn is-primary" onClick={() => setPickerVendaId(p.vendaId)}>
                + Novo documento
              </button>
              <button
                type="button"
                className="word-action-btn"
                onClick={() => void handleToggleFinalize(p.vendaId, p.finalizado)}
              >
                {p.finalizado ? "Reabrir" : "Finalizar"}
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  className="word-action-btn is-danger"
                  onClick={() => void handleDeleteProcesso(p.vendaId)}
                >
                  Excluir processo
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <section className="word-workspace">
      <aside className="word-sidebar">
        <div className="word-sidebar-top">
          <input
            type="search"
            className="vendedor-search"
            placeholder="Buscar por placa..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar processo por placa"
          />
          {canManageTemplates ? (
            <button type="button" className="word-action-btn" onClick={() => setShowManager(true)}>
              Gerenciar templates
            </button>
          ) : null}
        </div>

        {error ? <p className="word-error">{error}</p> : null}
        {loading ? <p className="word-hint">Carregando...</p> : null}

        <div className="word-section">
          <h2 className="word-section-title">Em andamento</h2>
          {emAndamento.length === 0 && !loading ? (
            <p className="word-hint">Nenhum processo em andamento.</p>
          ) : (
            <ul className="word-proc-list">{emAndamento.map(renderProcesso)}</ul>
          )}
        </div>

        <div className="word-section">
          <h2 className="word-section-title">Finalizados</h2>
          {finalizados.length === 0 && !loading ? (
            <p className="word-hint">Nenhum processo finalizado.</p>
          ) : (
            <ul className="word-proc-list">{finalizados.map(renderProcesso)}</ul>
          )}
        </div>
      </aside>

      <div className="word-main">
        {docLoading ? (
          <div className="word-empty">Carregando documento...</div>
        ) : docState && selDocId ? (
          <WordEditor
            key={selDocId}
            auth={auth}
            documentoId={selDocId}
            initialTitulo={docState.doc.titulo}
            initialConteudo={(docState.doc.conteudo as JSONContent) ?? EMPTY_DOC}
            contexto={docState.contexto}
            onSaved={onSaved}
          />
        ) : (
          <div className="word-empty">
            <p>Selecione um veiculo e abra ou crie um documento.</p>
            <p className="word-hint">A navegacao a esquerda lista os veiculos por placa.</p>
          </div>
        )}
      </div>

      {pickerVendaId ? (
        <TemplatePicker
          auth={auth}
          onClose={() => setPickerVendaId(null)}
          onPick={(tpl) => void handleCreate(pickerVendaId, tpl)}
        />
      ) : null}

      {showManager ? <TemplateManager auth={auth} onClose={() => setShowManager(false)} /> : null}
    </section>
  );
}
