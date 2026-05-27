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
  const [postAtivos, setPostAtivos] = useState<PostitRow[]>([]);
  const [postBusy, setPostBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postMsg, setPostMsg] = useState<string | null>(null);

  const carroIdByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of carros) map.set(option.label, option.id);
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
  const loadAtivos = useCallback(
    async (carroId: string) => {
      if (!carroId) {
        setPostAtivos([]);
        return;
      }
      try {
        const { ativas } = await listPostitsAtivos({ carroId, requestAuth });
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
    if (!postCarroId) {
      setPostError("Selecione um veiculo.");
      return;
    }
    if (!postTexto.trim()) {
      setPostError("Escreva a observacao.");
      return;
    }
    setPostBusy(true);
    try {
      await criarPostit({ requestAuth, carroId: postCarroId, tipo: postTipo, texto: postTexto.trim() });
      setPostMsg("Post-it criado.");
      setPostTexto("");
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
        title={urgentes > 0 ? `${urgentes} post-it(s) urgente(s) ativo(s)` : "Criar post-it para um veiculo"}
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
              <div className="vshort-dialog" onClick={(event) => event.stopPropagation()}>
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
                  <strong>Post-it do veiculo</strong>
                  <button type="button" className="vshort-close" onClick={closePostit} aria-label="Fechar">
                    ×
                  </button>
                </div>

                <div className="vshort-body">
                  <label className="vshort-field">
                    <span>Veiculo</span>
                    <input
                      list="vshort-carros-post"
                      value={postCarroLabel}
                      placeholder="Busque por placa ou nome"
                      data-testid="postit-carro"
                      onChange={(event) => setPostCarroLabel(event.target.value)}
                    />
                    {carroDatalist("vshort-carros-post")}
                  </label>

                  <label className="vshort-field">
                    <span>Tipo</span>
                    <select
                      value={postTipo}
                      data-testid="postit-tipo"
                      onChange={(event) => setPostTipo(event.target.value as ObservacaoTipo)}
                    >
                      <option value="observacao">Observacao</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </label>

                  <label className="vshort-field">
                    <span>Observacao</span>
                    <textarea
                      value={postTexto}
                      rows={3}
                      data-testid="postit-texto"
                      onChange={(event) => setPostTexto(event.target.value)}
                    />
                  </label>

                  <button
                    type="button"
                    className="vshort-primary"
                    onClick={() => void submitPostit()}
                    disabled={postBusy || !postCarroId}
                    data-testid="postit-submit"
                  >
                    Criar post-it
                  </button>

                  {postCarroId ? (
                    <div className="vshort-list" data-testid="postit-ativos">
                      <span className="vshort-list-title">Post-its ativos</span>
                      {postAtivos.length === 0 ? (
                        <p className="vshort-empty">Nenhum post-it ativo para este veiculo.</p>
                      ) : (
                        postAtivos.map((row) => (
                          <div
                            key={row.id}
                            className={`vshort-list-item vshort-postit ${row.tipo === "urgente" ? "is-urgent" : ""}`}
                          >
                            <span className="vshort-postit-text">
                              {row.tipo === "urgente" ? "🔴 " : ""}
                              {row.texto}
                            </span>
                            {canResolvePostits ? (
                              <button
                                type="button"
                                className="vshort-secondary"
                                onClick={() => void submitResolver(row.id)}
                                disabled={postBusy}
                                data-testid={`postit-resolver-${row.id}`}
                              >
                                Resolver
                              </button>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

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
