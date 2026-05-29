"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  ApiClientError,
  criarPostit,
  devolverEnvelope,
  fetchSheetRows,
  fetchUrgentesCount,
  listEnvelopesAbertos,
  listPostitsAtivos,
  registrarRetiradaEnvelope,
  resolverPostit,
  type EnvelopeAbertoRow,
  type EnvelopeItem,
  type ObservacaoTipo,
  type PostitRow
} from "@/components/ui-grid/api";
import type { RequestAuth, SheetKey } from "@/components/ui-grid/types";

type CarroOption = { id: string; label: string };

type VehicleShortcutsProps = {
  requestAuth: RequestAuth;
  /** SECRETARIO+ pode resolver post-its. */
  canResolvePostits: boolean;
  onNavigateToTable: (key: SheetKey) => void;
};

const ITEM_LABEL: Record<EnvelopeItem, string> = {
  envelope: "Envelope",
  chave_reserva: "Chave reserva"
};

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function buildCarroLabel(row: Record<string, unknown>): string {
  const placa = String(row.placa ?? "").trim();
  const nome = String(row.nome ?? "").trim();
  if (placa && nome) return `${placa} — ${nome}`;
  return placa || nome || String(row.id ?? "");
}

const TIPO_META: Record<ObservacaoTipo, { label: string; icon: string }> = {
  fixo: { label: "Fixo", icon: "📌" },
  urgente: { label: "Urgente", icon: "🔴" },
  observacao: { label: "Observacao", icon: "📝" }
};

type PostitFilter = "todos" | ObservacaoTipo;

/** Info de prazo relativo. Compara componentes YYYY-MM-DD (sem shift de fuso). */
function prazoInfo(prazo: string | null): { label: string; tone: "overdue" | "soon" | "ok" } | null {
  const match = prazo ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(prazo) : null;
  if (!match) return null;
  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due - today) / 86_400_000);
  const dm = `${match[3]}/${match[2]}`;
  if (days < 0) return { label: `Atrasado ${Math.abs(days)}d`, tone: "overdue" };
  if (days === 0) return { label: "Vence hoje", tone: "overdue" };
  if (days <= 3) return { label: `Em ${days}d · ${dm}`, tone: "soon" };
  return { label: dm, tone: "ok" };
}

export function VehicleShortcuts({ requestAuth, canResolvePostits, onNavigateToTable }: VehicleShortcutsProps) {
  const [carros, setCarros] = useState<CarroOption[]>([]);
  const carrosLoadedRef = useRef(false);
  const [urgentes, setUrgentes] = useState(0);

  const [envelopeOpen, setEnvelopeOpen] = useState(false);
  const [envCarroLabel, setEnvCarroLabel] = useState("");
  const [envItem, setEnvItem] = useState<EnvelopeItem>("envelope");
  const [envObs, setEnvObs] = useState("");
  const [envAbertos, setEnvAbertos] = useState<EnvelopeAbertoRow[]>([]);
  const [envBusy, setEnvBusy] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [envMsg, setEnvMsg] = useState<string | null>(null);

  const [postitOpen, setPostitOpen] = useState(false);
  const [postCarroLabel, setPostCarroLabel] = useState("");
  const [postTipo, setPostTipo] = useState<ObservacaoTipo>("observacao");
  const [postTexto, setPostTexto] = useState("");
  const [postPrazo, setPostPrazo] = useState("");
  const [postTitulo, setPostTitulo] = useState("");
  const [postFiltro, setPostFiltro] = useState<PostitFilter>("todos");
  const [postAtivos, setPostAtivos] = useState<PostitRow[]>([]);
  const [postBusy, setPostBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postMsg, setPostMsg] = useState<string | null>(null);

  const carroIdByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of carros) map.set(option.label, option.id);
    return map;
  }, [carros]);

  const carroLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of carros) map.set(option.id, option.label);
    return map;
  }, [carros]);

  const envCarroId = carroIdByLabel.get(envCarroLabel) ?? "";
  const postCarroId = carroIdByLabel.get(postCarroLabel) ?? "";

  const refreshUrgentes = useCallback(async () => {
    try {
      const { count } = await fetchUrgentesCount(requestAuth);
      setUrgentes(count);
    } catch {
      // silencioso: o badge e informativo
    }
  }, [requestAuth]);

  useEffect(() => {
    void refreshUrgentes();
  }, [refreshUrgentes]);

  const ensureCarros = useCallback(async () => {
    if (carrosLoadedRef.current) return;
    carrosLoadedRef.current = true;
    try {
      const payload = await fetchSheetRows({
        table: "carros" as SheetKey,
        requestAuth,
        page: 1,
        pageSize: 1000,
        query: "",
        matchMode: "contains",
        filters: {},
        sort: []
      });
      const options = payload.rows
        .map((row) => ({ id: String(row.id ?? ""), label: buildCarroLabel(row) }))
        .filter((option) => option.id);
      setCarros(options);
    } catch {
      carrosLoadedRef.current = false;
    }
  }, [requestAuth]);

  // ---- Envelope ----
  const loadAbertos = useCallback(
    async (carroId: string) => {
      if (!carroId) {
        setEnvAbertos([]);
        return;
      }
      try {
        const { abertos } = await listEnvelopesAbertos({ carroId, requestAuth });
        setEnvAbertos(abertos);
      } catch (err) {
        setEnvError(errorMessage(err, "Falha ao carregar retiradas."));
      }
    },
    [requestAuth]
  );

  useEffect(() => {
    if (!envelopeOpen) return;
    void loadAbertos(envCarroId);
  }, [envelopeOpen, envCarroId, loadAbertos]);

  function openEnvelope() {
    setEnvError(null);
    setEnvMsg(null);
    setEnvelopeOpen(true);
    void ensureCarros();
  }

  function closeEnvelope() {
    setEnvelopeOpen(false);
  }

  async function submitRetirada() {
    setEnvError(null);
    setEnvMsg(null);
    if (!envCarroId) {
      setEnvError("Selecione um veiculo.");
      return;
    }
    setEnvBusy(true);
    try {
      await registrarRetiradaEnvelope({ requestAuth, carroId: envCarroId, item: envItem, observacao: envObs });
      setEnvMsg(`${ITEM_LABEL[envItem]} retirado(a) e registrado(a).`);
      setEnvObs("");
      await loadAbertos(envCarroId);
    } catch (err) {
      setEnvError(errorMessage(err, "Falha ao registrar a retirada."));
    } finally {
      setEnvBusy(false);
    }
  }

  async function submitDevolucao(id: string) {
    setEnvError(null);
    setEnvMsg(null);
    setEnvBusy(true);
    try {
      await devolverEnvelope({ requestAuth, id });
      setEnvMsg("Devolucao registrada.");
      await loadAbertos(envCarroId);
    } catch (err) {
      setEnvError(errorMessage(err, "Falha ao registrar a devolucao."));
    } finally {
      setEnvBusy(false);
    }
  }

  // ---- Post-it ----
  // Com carroId: post-its do veiculo. Sem carroId: os 10 mais recentes (qualquer veiculo).
  const loadAtivos = useCallback(
    async (carroId: string) => {
      try {
        const { ativas } = await listPostitsAtivos({ carroId: carroId || null, requestAuth });
        setPostAtivos(ativas);
      } catch (err) {
        setPostError(errorMessage(err, "Falha ao carregar post-its."));
      }
    },
    [requestAuth]
  );

  useEffect(() => {
    if (!postitOpen) return;
    void loadAtivos(postCarroId);
  }, [postitOpen, postCarroId, loadAtivos]);

  function openPostit() {
    setPostError(null);
    setPostMsg(null);
    setPostitOpen(true);
    void ensureCarros();
  }

  function closePostit() {
    setPostitOpen(false);
  }

  async function submitPostit() {
    setPostError(null);
    setPostMsg(null);
    if (!postTexto.trim()) {
      setPostError("Escreva a observacao.");
      return;
    }
    setPostBusy(true);
    try {
      await criarPostit({
        requestAuth,
        carroId: postCarroId || null,
        titulo: postCarroId ? null : postTitulo || null,
        tipo: postTipo,
        texto: postTexto.trim(),
        prazo: postPrazo || null
      });
      setPostMsg("Post-it criado.");
      setPostTexto("");
      setPostPrazo("");
      setPostTitulo("");
      await Promise.all([loadAtivos(postCarroId), refreshUrgentes()]);
    } catch (err) {
      setPostError(errorMessage(err, "Falha ao criar o post-it."));
    } finally {
      setPostBusy(false);
    }
  }

  async function submitResolver(id: string) {
    setPostError(null);
    setPostMsg(null);
    setPostBusy(true);
    try {
      await resolverPostit({ requestAuth, id });
      setPostMsg("Post-it resolvido.");
      await Promise.all([loadAtivos(postCarroId), refreshUrgentes()]);
    } catch (err) {
      setPostError(errorMessage(err, "Falha ao resolver o post-it."));
    } finally {
      setPostBusy(false);
    }
  }

  const carroDatalist = (id: string) => (
    <datalist id={id}>
      {carros.map((option) => (
        <option key={option.id} value={option.label} />
      ))}
    </datalist>
  );

  return (
    <>
      <button
        type="button"
        className="sheet-nav-btn vshort-trigger"
        onClick={openEnvelope}
        data-testid="shortcut-envelope"
        title="Registrar retirada/devolucao de envelope ou chave reserva"
      >
        ✉ Envelope
      </button>
      <button
        type="button"
        className={`sheet-nav-btn vshort-trigger ${urgentes > 0 ? "vshort-trigger-urgent" : ""}`}
        onClick={openPostit}
        data-testid="shortcut-postit"
        title={urgentes > 0 ? `${urgentes} post-it(s) urgente(s) ativo(s)` : "Ver post-its recentes e criar novos"}
      >
        📝 Post-it
        {urgentes > 0 ? <span className="vshort-badge" data-testid="postit-urgent-badge">{urgentes}</span> : null}
      </button>

      {envelopeOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="vshort-overlay" data-testid="envelope-dialog" onClick={closeEnvelope}>
              <div className="vshort-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="vshort-head">
                  <button
                    type="button"
                    className="vshort-goto"
                    data-testid="envelope-goto-table"
                    onClick={() => {
                      onNavigateToTable("controle_envelopes" as SheetKey);
                      closeEnvelope();
                    }}
                  >
                    ← Ir para a tabela
                  </button>
                  <strong>Controle de envelopes</strong>
                  <button type="button" className="vshort-close" onClick={closeEnvelope} aria-label="Fechar">
                    ×
                  </button>
                </div>

                <div className="vshort-body">
                  <label className="vshort-field">
                    <span>Veiculo</span>
                    <input
                      list="vshort-carros-env"
                      value={envCarroLabel}
                      placeholder="Busque por placa ou nome"
                      data-testid="envelope-carro"
                      onChange={(event) => setEnvCarroLabel(event.target.value)}
                    />
                    {carroDatalist("vshort-carros-env")}
                  </label>

                  <label className="vshort-field">
                    <span>Item</span>
                    <select
                      value={envItem}
                      data-testid="envelope-item"
                      onChange={(event) => setEnvItem(event.target.value as EnvelopeItem)}
                    >
                      <option value="envelope">Envelope</option>
                      <option value="chave_reserva">Chave reserva</option>
                    </select>
                  </label>

                  <label className="vshort-field">
                    <span>Observacao (opcional)</span>
                    <textarea
                      value={envObs}
                      rows={2}
                      data-testid="envelope-obs"
                      onChange={(event) => setEnvObs(event.target.value)}
                    />
                  </label>

                  <button
                    type="button"
                    className="vshort-primary"
                    onClick={() => void submitRetirada()}
                    disabled={envBusy || !envCarroId}
                    data-testid="envelope-submit"
                  >
                    Registrar retirada
                  </button>

                  {envCarroId ? (
                    <div className="vshort-list" data-testid="envelope-abertos">
                      <span className="vshort-list-title">Em posse de alguem</span>
                      {envAbertos.length === 0 ? (
                        <p className="vshort-empty">Nenhum item retirado para este veiculo.</p>
                      ) : (
                        envAbertos.map((row) => (
                          <div key={row.id} className="vshort-list-item">
                            <span>{ITEM_LABEL[row.item] ?? row.item}</span>
                            <button
                              type="button"
                              className="vshort-secondary"
                              onClick={() => void submitDevolucao(row.id)}
                              disabled={envBusy}
                              data-testid={`envelope-devolver-${row.item}`}
                            >
                              Devolver
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {envError ? <p className="vshort-error" data-testid="envelope-error">{envError}</p> : null}
                  {envMsg ? <p className="vshort-ok" data-testid="envelope-msg">{envMsg}</p> : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {postitOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="vshort-overlay" data-testid="postit-dialog" onClick={closePostit}>
              <div className="vshort-dialog vshort-dialog-lg" onClick={(event) => event.stopPropagation()}>
                <div className="vshort-head">
                  <button
                    type="button"
                    className="vshort-goto"
                    data-testid="postit-goto-table"
                    onClick={() => {
                      onNavigateToTable("observacoes" as SheetKey);
                      closePostit();
                    }}
                  >
                    ← Ir para a tabela
                  </button>
                  <strong>Post-its</strong>
                  <button type="button" className="vshort-close" onClick={closePostit} aria-label="Fechar">
                    ×
                  </button>
                </div>

                <div className="vshort-body">
                  <div className="vshort-postit-form">
                    <label className="vshort-field">
                      <span>Veiculo (opcional)</span>
                      <input
                        list="vshort-carros-post"
                        value={postCarroLabel}
                        placeholder="Deixe vazio para post-it sem veiculo"
                        data-testid="postit-carro"
                        onChange={(event) => setPostCarroLabel(event.target.value)}
                      />
                      {carroDatalist("vshort-carros-post")}
                    </label>

                    {!postCarroId ? (
                      <label className="vshort-field">
                        <span>Titulo (sem veiculo)</span>
                        <input
                          value={postTitulo}
                          placeholder="Ex.: Comprar material de limpeza"
                          maxLength={120}
                          data-testid="postit-titulo"
                          onChange={(event) => setPostTitulo(event.target.value)}
                        />
                      </label>
                    ) : null}

                    <div className="vshort-row">
                      <label className="vshort-field">
                        <span>Tipo</span>
                        <select
                          value={postTipo}
                          data-testid="postit-tipo"
                          onChange={(event) => setPostTipo(event.target.value as ObservacaoTipo)}
                        >
                          <option value="observacao">📝 Observacao</option>
                          <option value="urgente">🔴 Urgente</option>
                          <option value="fixo">📌 Fixo</option>
                        </select>
                      </label>
                      <label className="vshort-field">
                        <span>Prazo (opcional)</span>
                        <input
                          type="date"
                          value={postPrazo}
                          data-testid="postit-prazo"
                          onChange={(event) => setPostPrazo(event.target.value)}
                        />
                      </label>
                    </div>

                    <label className="vshort-field">
                      <span>Texto</span>
                      <textarea
                        value={postTexto}
                        rows={2}
                        data-testid="postit-texto"
                        onChange={(event) => setPostTexto(event.target.value)}
                      />
                    </label>

                    <button
                      type="button"
                      className="vshort-primary"
                      onClick={() => void submitPostit()}
                      disabled={postBusy || !postTexto.trim()}
                      data-testid="postit-submit"
                    >
                      Criar post-it
                    </button>
                  </div>

                  <div className="vshort-list-head">
                    <span className="vshort-list-title">
                      {postCarroId ? "Post-its do veiculo" : "Post-its recentes"}
                    </span>
                    <div className="vshort-filtros" data-testid="postit-filtros">
                      {(
                        [
                          ["todos", "Todos"],
                          ["fixo", "📌"],
                          ["urgente", "🔴"],
                          ["observacao", "📝"]
                        ] as [PostitFilter, string][]
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={`vshort-chip ${postFiltro === key ? "is-active" : ""}`}
                          onClick={() => setPostFiltro(key)}
                          data-testid={`postit-filtro-${key}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(() => {
                    const visiveis = postAtivos.filter((row) => postFiltro === "todos" || row.tipo === postFiltro);
                    if (visiveis.length === 0) {
                      return <p className="vshort-empty">Nenhum post-it nesta visao.</p>;
                    }
                    return (
                      <div className="vshort-postit-scroll" data-testid="postit-ativos">
                        <div className="vshort-postit-grid">
                          {visiveis.map((row) => {
                            const meta = TIPO_META[row.tipo];
                            const pinfo = prazoInfo(row.prazo);
                            return (
                              <div
                                key={row.id}
                                className={`vshort-pcard is-${row.tipo}`}
                                data-testid={`postit-card-${row.id}`}
                              >
                                <div className="vshort-pcard-head">
                                  <span className="vshort-pcard-tipo">
                                    {meta.icon} {meta.label}
                                  </span>
                                  {pinfo ? (
                                    <span className={`vshort-pcard-prazo is-${pinfo.tone}`}>⏰ {pinfo.label}</span>
                                  ) : null}
                                </div>
                                {!postCarroId ? (
                                  <span className="vshort-pcard-carro">
                                    {row.carro_id
                                      ? carroLabelById.get(row.carro_id) ?? "Veiculo"
                                      : row.titulo || "Sem titulo"}
                                  </span>
                                ) : null}
                                <p className="vshort-pcard-text">{row.texto}</p>
                                {canResolvePostits ? (
                                  <button
                                    type="button"
                                    className="vshort-pcard-resolve"
                                    onClick={() => void submitResolver(row.id)}
                                    disabled={postBusy}
                                    data-testid={`postit-resolver-${row.id}`}
                                  >
                                    Resolver
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {postError ? <p className="vshort-error" data-testid="postit-error">{postError}</p> : null}
                  {postMsg ? <p className="vshort-ok" data-testid="postit-msg">{postMsg}</p> : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
