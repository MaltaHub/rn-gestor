"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { JSONContent } from "@tiptap/core";
import { confirmDialog } from "@/components/ui/dialog/confirm";
import type { RequestAuth } from "@/components/ui-grid/types";
import { useAuthSessionState } from "@/components/auth/auth-provider";
import { fetchPainelVeiculo } from "@/components/vendedor/api";
import { checklistDoPainel, vendaTemTroca } from "@/components/vendedor/checklist-painel";
import { useListaPreferencias } from "@/components/vendedor/lista-preferencias";
import { Icon } from "@/components/vendedor/ui/icons";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { useVeiculosVendedor } from "@/components/vendedor/use-veiculos";
import { AbrindoVeiculo, SituacaoBadge, VeiculoFiltros, VeiculoLista } from "@/components/vendedor/veiculos/veiculos-ui";
import { deleteDocumento, fetchDocumentosVenda, fetchVendaDocContext } from "@/components/vendedor/word/api";
import { conferirEImprimir } from "@/components/vendedor/word/imprimir";
import { PlacaPainel } from "@/components/vendedor/word/placa-painel";
import { EMPTY_DOC } from "@/components/vendedor/word/tiptap-config";
import { useNovoDocumento } from "@/components/vendedor/word/use-novo-documento";
import { WordEditor } from "@/components/vendedor/word/word-editor";
import styles from "@/components/vendedor/word/word-workspace.module.css";
import type { CategoriaDocumento } from "@/lib/domain/venda-documentos/categorias";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import type { VendaDocumentoRow } from "@/lib/domain/db";
import type { PainelVeiculo, SituacaoFiltro, VeiculoVendedorItem } from "@/lib/domain/vendedor/types";

// Gestão de templates só abre para GERENTE+: o código vem sob demanda.
const TemplateManager = dynamic(() => import("@/components/vendedor/word/template-manager").then((m) => m.TemplateManager), { ssr: false });

const FILTROS_WORD: SituacaoFiltro[] = ["vendido", "reservado", "entregue", "finalizado", "disponivel"];

function syncUrl(carroId: string | null, docId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("venda");
  if (carroId) url.searchParams.set("carro", carroId);
  else url.searchParams.delete("carro");
  if (docId) url.searchParams.set("doc", docId);
  else url.searchParams.delete("doc");
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * Word do vendedor: escolhe a placa na lista (por situação; ordem Recentes ou
 * A–Z) e vê TUDO dela — veículo, venda, checklist dos documentos e as
 * miniaturas (com Imprimir direto). "Novo documento" pede só a categoria. O
 * documento abre no editor com o cabeçalho e o ribbon na barra fixa do topo
 * (portais do WordEditor/WordSurface).
 */
export function WordWorkspace({
  authOverride,
  initialCarroId = null,
  initialDocId = null
}: { authOverride?: RequestAuth; initialCarroId?: string | null; initialDocId?: string | null } = {}) {
  const sessionAuth = useVendedorAuth();
  const auth = authOverride ?? sessionAuth;
  const { actor } = useAuthSessionState();
  const canManageTemplates = actor?.role === "GERENTE" || actor?.role === "ADMINISTRADOR";

  const { q, setQ, ordem, setOrdem } = useListaPreferencias();
  const [situacao, setSituacao] = useState<SituacaoFiltro>("vendido");
  const lista = useVeiculosVendedor(auth, { situacao, q, ordem });

  const [navOpen, setNavOpen] = useState(true);
  const [carroId, setCarroId] = useState<string | null>(initialCarroId);
  const [abrindo, setAbrindo] = useState<VeiculoVendedorItem | null>(null);
  const [docId, setDocId] = useState<string | null>(initialDocId);
  const [painel, setPainel] = useState<PainelVeiculo | null>(null);
  const [docs, setDocs] = useState<VendaDocumentoRow[] | null>(null);
  const [contexto, setContexto] = useState<VendaDocContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [barHeadEl, setBarHeadEl] = useState<HTMLDivElement | null>(null);
  const [barRibbonEl, setBarRibbonEl] = useState<HTMLDivElement | null>(null);
  const novoDocumento = useNovoDocumento(auth);

  // Só vale o painel DA placa selecionada: trocar de placa limpa o palco na hora.
  const painelAtual = painel && painel.carro.id === carroId ? painel : null;
  const vendaId = painelAtual?.venda?.id ?? null;
  const vendaDocsRef = useRef<string | null>(null);

  const carregarPainel = useCallback(
    async (id: string, signal?: AbortSignal) => {
      setError(null);
      try {
        const data = await fetchPainelVeiculo(auth, id, signal);
        if (!signal?.aborted) setPainel(data);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar a placa.");
      }
    },
    [auth]
  );

  useEffect(() => {
    if (!carroId) return;
    const controller = new AbortController();
    void carregarPainel(carroId, controller.signal);
    return () => controller.abort();
  }, [carregarPainel, carroId]);

  const carregarDocs = useCallback(
    async (id: string) => {
      vendaDocsRef.current = id;
      setDocs(null);
      setContexto(null);
      try {
        const [rows, ctx] = await Promise.all([fetchDocumentosVenda(auth, id), fetchVendaDocContext(auth, id)]);
        // Trocou de placa no meio: a resposta antiga não entra.
        if (vendaDocsRef.current !== id) return;
        setDocs(rows);
        setContexto(ctx);
      } catch (err) {
        if (vendaDocsRef.current !== id) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar os documentos.");
        setDocs([]);
      }
    },
    [auth]
  );

  useEffect(() => {
    if (!vendaId) {
      vendaDocsRef.current = null;
      setDocs(null);
      setContexto(null);
      return;
    }
    void carregarDocs(vendaId);
  }, [carregarDocs, vendaId]);

  useEffect(() => {
    syncUrl(carroId, docId);
  }, [carroId, docId]);

  const checklist = useMemo(() => (painelAtual?.venda ? checklistDoPainel(painelAtual) : []), [painelAtual]);
  const docAberto = docId && docs ? docs.find((doc) => doc.id === docId) ?? null : null;
  const docOpen = Boolean(docAberto && contexto);

  // Deep link para um documento que não existe mais: volta para a placa.
  useEffect(() => {
    if (docId && docs && !docs.some((doc) => doc.id === docId)) setDocId(null);
  }, [docId, docs]);

  function selecionarPlaca(item: VeiculoVendedorItem) {
    setDocId(null);
    if (item.carroId !== carroId) {
      setAbrindo(item);
      setPainel(null);
      setDocs(null);
      setContexto(null);
      setError(null);
      vendaDocsRef.current = null;
      setCarroId(item.carroId);
    }
    if (typeof window !== "undefined" && window.innerWidth < 900) setNavOpen(false);
  }

  function abrirDocumento(id: string) {
    setDocId(id);
    setNavOpen(false);
  }

  function voltarParaPlaca() {
    setDocId(null);
    setNavOpen(true);
    if (vendaId) void carregarDocs(vendaId);
  }

  async function gerar(categoria: CategoriaDocumento) {
    if (!vendaId || !carroId) return;
    try {
      const doc = await novoDocumento.criarDaCategoria(vendaId, categoria, { temTroca: painelAtual ? vendaTemTroca(painelAtual) : false });
      if (!doc) return;
      setDocs((prev) => [doc, ...(prev ?? [])]);
      void carregarPainel(carroId);
      abrirDocumento(doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar o documento.");
    }
  }

  async function novo() {
    if (!vendaId || !carroId) return;
    try {
      const relevancias = Object.fromEntries(checklist.map((item) => [item.categoria.key, item.relevancia]));
      const gerados = Object.fromEntries(checklist.map((item) => [item.categoria.key, item.documentos.length]));
      const doc = await novoDocumento.escolherECriar(vendaId, relevancias, gerados, { temTroca: painelAtual ? vendaTemTroca(painelAtual) : false });
      if (!doc) return;
      setDocs((prev) => [doc, ...(prev ?? [])]);
      void carregarPainel(carroId);
      abrirDocumento(doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar o documento.");
    }
  }

  async function excluir(doc: VendaDocumentoRow) {
    const ok = await confirmDialog({
      title: `Excluir "${doc.titulo}"?`,
      message: "O documento sai da venda. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      tone: "danger"
    });
    if (!ok || !carroId) return;
    try {
      await deleteDocumento(auth, doc.id);
      setDocs((prev) => (prev ?? []).filter((item) => item.id !== doc.id));
      if (docId === doc.id) setDocId(null);
      void carregarPainel(carroId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir o documento.");
    }
  }

  async function imprimir(doc: VendaDocumentoRow) {
    if (!contexto) return;
    try {
      await conferirEImprimir((doc.conteudo as JSONContent) ?? EMPTY_DOC, contexto, doc.titulo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao imprimir o documento.");
    }
  }

  const onSaved = useCallback(({ id, titulo, categoria }: { id: string; titulo: string; categoria: string | null }) => {
    setDocs((prev) => (prev ?? []).map((doc) => (doc.id === id ? { ...doc, titulo, categoria } : doc)));
  }, []);

  const carregandoPlaca = Boolean(carroId && !painelAtual && !error);
  const templatesBtn = canManageTemplates ? (
    <button type="button" className={styles.btn} onClick={() => setManagerOpen(true)} data-testid="word-templates">
      <Icon name="file" size={16} />
      Templates
    </button>
  ) : null;

  return (
    <section className={styles.app} data-testid="word-app">
      <div className={styles.bar} data-testid="word-bar">
        <div className={styles.barHead}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setNavOpen((open) => !open)}
            aria-pressed={navOpen}
            aria-label={navOpen ? "Esconder a lista de placas" : "Mostrar a lista de placas"}
            title={navOpen ? "Esconder a lista de placas" : "Mostrar a lista de placas"}
            data-testid="word-toggle-nav"
          >
            <Icon name="menu" size={18} />
          </button>

          {docOpen && painelAtual ? (
            <>
              <button type="button" className={styles.iconBtn} onClick={voltarParaPlaca} aria-label="Voltar para a placa" title="Voltar para a placa">
                <Icon name="arrowLeft" size={18} />
              </button>
              <span className={styles.placa}>{painelAtual.carro.placa}</span>
              <div className={styles.barSlot} ref={setBarHeadEl} />
            </>
          ) : painelAtual ? (
            <>
              <span className={styles.placa}>{painelAtual.carro.placa}</span>
              <span className={styles.barSub}>{painelAtual.carro.modelo ?? "—"}</span>
              <SituacaoBadge situacao={painelAtual.situacao} />
              <span className={styles.spacer} />
              {templatesBtn}
            </>
          ) : (
            <>
              {carregandoPlaca && abrindo ? <span className={styles.placa}>{abrindo.placa}</span> : <span className={styles.barTitle}>Documentos</span>}
              <span className={styles.barSub}>{carregandoPlaca ? "Abrindo..." : "Escolha uma placa"}</span>
              <span className={styles.spacer} />
              {templatesBtn}
            </>
          )}
        </div>
        <div className={styles.ribbon} ref={setBarRibbonEl} hidden={!docOpen} data-testid="word-bar-ribbon" />
      </div>

      <div className={styles.under}>
        <aside className={styles.nav} data-open={navOpen ? "true" : undefined} aria-label="Placas" data-testid="word-nav">
          {navOpen ? (
            <>
              <div className={styles.navHead}>
                <VeiculoFiltros
                  q={q}
                  onQ={setQ}
                  situacao={situacao}
                  onSituacao={setSituacao}
                  contagens={lista.contagens}
                  opcoes={FILTROS_WORD}
                  buscando={lista.buscando}
                  ordem={ordem}
                  onOrdem={setOrdem}
                  total={lista.loading && lista.itens.length === 0 ? null : lista.total}
                  testIdPrefix="word-placas"
                />
              </div>
              <div className={styles.navScroll} data-testid="word-nav-scroll">
                <VeiculoLista
                  itens={lista.itens}
                  selecionadoId={carroId}
                  carregandoId={carregandoPlaca ? carroId : null}
                  onSelecionar={selecionarPlaca}
                  loading={lista.loading}
                  error={lista.error}
                  hasMore={lista.hasMore}
                  onLoadMore={lista.loadMore}
                  vazio={lista.buscando ? "Nenhuma placa encontrada." : "Nenhuma placa nesta situação."}
                  testIdPrefix="word-placa"
                />
              </div>
            </>
          ) : (
            <div className={styles.rail}>
              <button type="button" className={styles.iconBtn} onClick={() => setNavOpen(true)} aria-label="Mostrar a lista de placas" title="Placas">
                <Icon name="car" size={18} />
              </button>
            </div>
          )}
        </aside>

        <div className={styles.stage} data-testid="word-stage">
          {error ? (
            <p className={styles.error}>
              {error}
              {carroId && !painelAtual ? (
                <button type="button" className={styles.linkBtn} onClick={() => void carregarPainel(carroId)}>
                  Tentar de novo
                </button>
              ) : null}
            </p>
          ) : null}
          {docOpen && docAberto && contexto ? (
            <WordEditor
              key={docAberto.id}
              auth={auth}
              documentoId={docAberto.id}
              initialTitulo={docAberto.titulo}
              initialConteudo={(docAberto.conteudo as JSONContent) ?? EMPTY_DOC}
              initialCategoria={docAberto.categoria ?? null}
              contexto={contexto}
              onSaved={onSaved}
              barHeadEl={barHeadEl}
              barRibbonEl={barRibbonEl}
            />
          ) : painelAtual ? (
            <PlacaPainel
              painel={painelAtual}
              checklist={checklist}
              documentos={docs}
              contexto={contexto}
              criando={novoDocumento.criando}
              onGerar={(categoria) => void gerar(categoria)}
              onNovo={() => void novo()}
              onAbrir={abrirDocumento}
              onImprimir={(doc) => void imprimir(doc)}
              onExcluir={(doc) => void excluir(doc)}
            />
          ) : carregandoPlaca ? (
            <AbrindoVeiculo item={abrindo && abrindo.carroId === carroId ? abrindo : null} />
          ) : !carroId ? (
            <div className={styles.empty}>
              <Icon name="file" size={28} />
              <p>Escolha uma placa na lista para ver a venda e os documentos dela.</p>
              {!navOpen ? (
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setNavOpen(true)}>
                  Mostrar placas
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {novoDocumento.dialogos}
      {managerOpen ? <TemplateManager auth={auth} onClose={() => setManagerOpen(false)} /> : null}
    </section>
  );
}
