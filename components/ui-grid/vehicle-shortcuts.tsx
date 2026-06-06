"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  ApiClientError,
  atualizarEnvelope,
  atualizarPostit,
  criarPostit,
  devolverEnvelope,
  excluirEnvelope,
  excluirPostit,
  fetchEnvelopesAbertosCount,
  fetchSheetRows,
  fetchUrgentesCount,
  listAccessUsers,
  listEnvelopesAbertos,
  listEnvelopesRecentes,
  listPostitsAtivos,
  registrarRetiradaEnvelope,
  resolverPostit,
  type AccessUserOption,
  type EnvelopeAbertoRow,
  type EnvelopeItem,
  type ObservacaoTipo,
  type PostitRow
} from "@/components/ui-grid/api";
import type { RequestAuth, Role, SheetKey } from "@/components/ui-grid/types";
import { hasRequiredRole } from "@/lib/domain/access";

type CarroOption = { id: string; label: string };

type VehicleShortcutsProps = {
  requestAuth: RequestAuth;
  /** SECRETARIO+ pode resolver post-its. */
  canResolvePostits: boolean;
  /** Cargo do usuario logado; usado pra liberar o modo ADM no envelope. */
  role: Role;
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

type EnvelopeAction = "retirada" | "devolucao";

/** Converte string vinda do <input type="datetime-local"> em ISO 8601. */
function localDateTimeToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

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

export function VehicleShortcuts({ requestAuth, canResolvePostits, role, onNavigateToTable }: VehicleShortcutsProps) {
  const isAdmin = hasRequiredRole(role, "ADMINISTRADOR");

  const [carros, setCarros] = useState<CarroOption[]>([]);
  const carrosLoadedRef = useRef(false);
  const [urgentes, setUrgentes] = useState(0);
  // Selo do botao de envelope: retiradas em aberto (com algum usuario) em todos os veiculos.
  const [envAbertosCount, setEnvAbertosCount] = useState(0);

  const [envelopeOpen, setEnvelopeOpen] = useState(false);
  const [envCarroLabel, setEnvCarroLabel] = useState("");
  const [envItem, setEnvItem] = useState<EnvelopeItem>("envelope");
  const [envObs, setEnvObs] = useState("");
  const [envAbertos, setEnvAbertos] = useState<EnvelopeAbertoRow[]>([]);
  // Ultimas interacoes (todos os veiculos), exibidas quando nenhuma placa esta selecionada.
  const [envRecentes, setEnvRecentes] = useState<EnvelopeAbertoRow[]>([]);
  const [envBusy, setEnvBusy] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [envMsg, setEnvMsg] = useState<string | null>(null);

  // ---- ADM ----
  const [admMode, setAdmMode] = useState(false);
  const [admAction, setAdmAction] = useState<EnvelopeAction>("retirada");
  const [admUserAuthId, setAdmUserAuthId] = useState<string>("");
  const [admWhen, setAdmWhen] = useState<string>("");
  const [admShowHistory, setAdmShowHistory] = useState(false);
  const [envHistorico, setEnvHistorico] = useState<EnvelopeAbertoRow[]>([]);
  const [admUsers, setAdmUsers] = useState<AccessUserOption[]>([]);
  const admUsersLoadedRef = useRef(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingPatch, setEditingPatch] = useState<{
    usuario_auth_user_id: string;
    retirado_em: string;
    devolvido_em: string;
    status: "com_usuario" | "devolvido";
    observacao: string;
  } | null>(null);

  const [postitOpen, setPostitOpen] = useState(false);
  const [postCarroLabel, setPostCarroLabel] = useState("");
  const [postTipo, setPostTipo] = useState<ObservacaoTipo>("observacao");
  const [postTexto, setPostTexto] = useState("");
  const [postPrazo, setPostPrazo] = useState("");
  const [postTitulo, setPostTitulo] = useState("");
  const [postFeedback, setPostFeedback] = useState("");
  const [postFiltro, setPostFiltro] = useState<PostitFilter>("todos");
  const [postAtivos, setPostAtivos] = useState<PostitRow[]>([]);
  const [postBusy, setPostBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postMsg, setPostMsg] = useState<string | null>(null);
  /** Quando setado: form opera em modo "editar este post-it". */
  const [editingPostitId, setEditingPostitId] = useState<string | null>(null);

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

  const refreshEnvAbertos = useCallback(async () => {
    try {
      const { count } = await fetchEnvelopesAbertosCount(requestAuth);
      setEnvAbertosCount(count);
    } catch {
      // silencioso: o selo e informativo
    }
  }, [requestAuth]);

  useEffect(() => {
    void refreshUrgentes();
    void refreshEnvAbertos();
  }, [refreshUrgentes, refreshEnvAbertos]);

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
  const ensureAdmUsers = useCallback(async () => {
    if (!isAdmin || admUsersLoadedRef.current) return;
    admUsersLoadedRef.current = true;
    try {
      const { users } = await listAccessUsers(requestAuth);
      setAdmUsers(users);
    } catch (err) {
      admUsersLoadedRef.current = false;
      setEnvError(errorMessage(err, "Falha ao carregar usuarios."));
    }
  }, [isAdmin, requestAuth]);

  const loadAbertos = useCallback(
    async (carroId: string) => {
      if (!carroId) {
        setEnvAbertos([]);
        setEnvHistorico([]);
        return;
      }
      try {
        const payload = await listEnvelopesAbertos({ carroId, requestAuth, includeClosed: isAdmin && admShowHistory });
        setEnvAbertos(payload.abertos);
        setEnvHistorico(payload.include_closed ? payload.rows : []);
      } catch (err) {
        setEnvError(errorMessage(err, "Falha ao carregar retiradas."));
      }
    },
    [requestAuth, isAdmin, admShowHistory]
  );

  const loadRecentes = useCallback(async () => {
    try {
      const { recentes } = await listEnvelopesRecentes(requestAuth);
      setEnvRecentes(recentes);
    } catch (err) {
      setEnvError(errorMessage(err, "Falha ao carregar interacoes recentes."));
    }
  }, [requestAuth]);

  useEffect(() => {
    if (!envelopeOpen) return;
    void loadAbertos(envCarroId);
  }, [envelopeOpen, envCarroId, loadAbertos]);

  useEffect(() => {
    if (!envelopeOpen) return;
    void loadRecentes();
  }, [envelopeOpen, loadRecentes]);

  useEffect(() => {
    if (!envelopeOpen || !isAdmin) return;
    void ensureAdmUsers();
  }, [envelopeOpen, isAdmin, ensureAdmUsers]);

  // Mapa rapido auth_user_id -> nome legivel.
  const userNameByAuthId = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of admUsers) {
      if (user.auth_user_id) map.set(user.auth_user_id, user.nome || user.email || user.auth_user_id);
    }
    return map;
  }, [admUsers]);

  function renderUserName(authUserId: string | null): string {
    if (!authUserId) return "—";
    return userNameByAuthId.get(authUserId) ?? authUserId.slice(0, 8);
  }

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
    const useAdmOverride = isAdmin && admMode;
    if (useAdmOverride && admAction === "devolucao") {
      // ADM em modo devolucao: o botao principal devolve o item em aberto desse
      // tipo no veiculo (com os overrides de usuario/data), em vez de ficar travado.
      const aberto = envAbertos.find((row) => row.item === envItem);
      if (!aberto) {
        setEnvError("Nenhum item em aberto deste tipo para devolver neste veiculo.");
        return;
      }
      await submitDevolucao(aberto.id);
      return;
    }
    setEnvBusy(true);
    try {
      const retiradoEm = useAdmOverride ? localDateTimeToIso(admWhen) : null;
      await registrarRetiradaEnvelope({
        requestAuth,
        carroId: envCarroId,
        item: envItem,
        observacao: envObs,
        usuarioAuthUserId: useAdmOverride && admUserAuthId ? admUserAuthId : undefined,
        retiradoEm
      });
      setEnvMsg(`${ITEM_LABEL[envItem]} retirado(a) e registrado(a).`);
      setEnvObs("");
      if (useAdmOverride) setAdmWhen("");
      await loadAbertos(envCarroId);
      void refreshEnvAbertos();
      void loadRecentes();
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
    const useAdmOverride = isAdmin && admMode;
    try {
      const devolvidoEm = useAdmOverride ? localDateTimeToIso(admWhen) : null;
      await devolverEnvelope({
        requestAuth,
        id,
        usuarioAuthUserId: useAdmOverride && admUserAuthId ? admUserAuthId : undefined,
        devolvidoEm
      });
      setEnvMsg("Devolucao registrada.");
      if (useAdmOverride) setAdmWhen("");
      await loadAbertos(envCarroId);
      void refreshEnvAbertos();
      void loadRecentes();
    } catch (err) {
      setEnvError(errorMessage(err, "Falha ao registrar a devolucao."));
    } finally {
      setEnvBusy(false);
    }
  }

  function startEdit(row: EnvelopeAbertoRow) {
    setEditingRowId(row.id);
    setEditingPatch({
      usuario_auth_user_id: row.usuario_auth_user_id ?? "",
      retirado_em: row.retirado_em ? new Date(row.retirado_em).toISOString().slice(0, 16) : "",
      devolvido_em: row.devolvido_em ? new Date(row.devolvido_em).toISOString().slice(0, 16) : "",
      status: row.status === "devolvido" ? "devolvido" : "com_usuario",
      observacao: row.observacao ?? ""
    });
  }

  function cancelEdit() {
    setEditingRowId(null);
    setEditingPatch(null);
  }

  async function submitEdit() {
    if (!editingRowId || !editingPatch) return;
    setEnvError(null);
    setEnvMsg(null);
    setEnvBusy(true);
    try {
      await atualizarEnvelope({
        requestAuth,
        id: editingRowId,
        patch: {
          usuario_auth_user_id: editingPatch.usuario_auth_user_id || null,
          retirado_em: localDateTimeToIso(editingPatch.retirado_em) || undefined,
          devolvido_em:
            editingPatch.status === "devolvido"
              ? localDateTimeToIso(editingPatch.devolvido_em) || undefined
              : null,
          status: editingPatch.status,
          observacao: editingPatch.observacao.trim() || null
        }
      });
      setEnvMsg("Registro atualizado.");
      cancelEdit();
      await loadAbertos(envCarroId);
      void refreshEnvAbertos();
      void loadRecentes();
    } catch (err) {
      setEnvError(errorMessage(err, "Falha ao atualizar."));
    } finally {
      setEnvBusy(false);
    }
  }

  async function submitDelete(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Apagar este registro? Esta acao nao pode ser desfeita.")) return;
    setEnvError(null);
    setEnvMsg(null);
    setEnvBusy(true);
    try {
      await excluirEnvelope({ requestAuth, id });
      setEnvMsg("Registro excluido.");
      await loadAbertos(envCarroId);
      void refreshEnvAbertos();
      void loadRecentes();
    } catch (err) {
      setEnvError(errorMessage(err, "Falha ao excluir."));
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

  function resetPostitForm() {
    setEditingPostitId(null);
    setPostTexto("");
    setPostPrazo("");
    setPostTitulo("");
    setPostFeedback("");
    setPostTipo("observacao");
    setPostCarroLabel("");
  }

  function startEditPostit(row: PostitRow) {
    setEditingPostitId(row.id);
    setPostTexto(row.texto ?? "");
    setPostPrazo(row.prazo ?? "");
    setPostTitulo(row.titulo ?? "");
    setPostTipo(row.tipo);
    setPostFeedback(row.feedback_solucao ?? "");
    setPostCarroLabel(row.carro_id ? carroLabelById.get(row.carro_id) ?? "" : "");
    setPostError(null);
    setPostMsg(null);
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
      if (editingPostitId) {
        await atualizarPostit({
          requestAuth,
          id: editingPostitId,
          patch: {
            titulo: postCarroId ? null : postTitulo || null,
            tipo: postTipo,
            texto: postTexto.trim(),
            prazo: postPrazo || null,
            feedback_solucao: postFeedback.trim() || null
          }
        });
        setPostMsg("Post-it atualizado.");
      } else {
        await criarPostit({
          requestAuth,
          carroId: postCarroId || null,
          titulo: postCarroId ? null : postTitulo || null,
          tipo: postTipo,
          texto: postTexto.trim(),
          prazo: postPrazo || null
        });
        setPostMsg("Post-it criado.");
      }
      resetPostitForm();
      await Promise.all([loadAtivos(postCarroId), refreshUrgentes()]);
    } catch (err) {
      setPostError(errorMessage(err, "Falha ao salvar o post-it."));
    } finally {
      setPostBusy(false);
    }
  }

  async function submitResolver() {
    if (!editingPostitId) {
      setPostError("Clique em um post-it para resolver.");
      return;
    }
    setPostError(null);
    setPostMsg(null);
    setPostBusy(true);
    try {
      await resolverPostit({
        requestAuth,
        id: editingPostitId,
        feedbackSolucao: postFeedback.trim() || null
      });
      setPostMsg("Post-it resolvido.");
      resetPostitForm();
      await Promise.all([loadAtivos(postCarroId), refreshUrgentes()]);
    } catch (err) {
      setPostError(errorMessage(err, "Falha ao resolver o post-it."));
    } finally {
      setPostBusy(false);
    }
  }

  async function submitDeletePostit() {
    if (!editingPostitId) {
      setPostError("Clique em um post-it para excluir.");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("Apagar este post-it? Esta acao nao pode ser desfeita.")) return;
    setPostError(null);
    setPostMsg(null);
    setPostBusy(true);
    try {
      await excluirPostit({ requestAuth, id: editingPostitId });
      setPostMsg("Post-it excluido.");
      resetPostitForm();
      await Promise.all([loadAtivos(postCarroId), refreshUrgentes()]);
    } catch (err) {
      setPostError(errorMessage(err, "Falha ao excluir o post-it."));
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
        className={`sheet-nav-btn vshort-trigger ${envAbertosCount > 0 ? "vshort-trigger-urgent" : ""}`}
        onClick={openEnvelope}
        data-testid="shortcut-envelope"
        title={
          envAbertosCount > 0
            ? `${envAbertosCount} item(ns) em posse de alguem`
            : "Registrar retirada/devolucao de envelope ou chave reserva"
        }
      >
        ✉ Envelope
        {envAbertosCount > 0 ? (
          <span className="vshort-badge" data-testid="envelope-abertos-badge">{envAbertosCount}</span>
        ) : null}
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
                  <div className="vshort-postit-form is-compact vshort-env-form" data-testid="envelope-form">
                    <div className="vshort-postit-form-head">
                      <strong>Nova retirada</strong>
                    </div>

                    <div className="vshort-row">
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

                      <label className="vshort-field vshort-field-item">
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
                    </div>

                    <label className="vshort-field">
                      <span>Observacao (opcional)</span>
                      <textarea
                        value={envObs}
                        rows={2}
                        data-testid="envelope-obs"
                        onChange={(event) => setEnvObs(event.target.value)}
                      />
                    </label>

                  {isAdmin ? (
                    <div className="vshort-adm" data-testid="envelope-adm">
                      <label className="vshort-adm-toggle">
                        <input
                          type="checkbox"
                          checked={admMode}
                          onChange={(event) => setAdmMode(event.target.checked)}
                          data-testid="envelope-adm-toggle"
                        />
                        <span>Modo administrador — definir quem pegou e a acao</span>
                      </label>

                      {admMode ? (
                        <div className="vshort-adm-grid">
                          <label className="vshort-field">
                            <span>Acao</span>
                            <select
                              value={admAction}
                              onChange={(event) => setAdmAction(event.target.value as EnvelopeAction)}
                              data-testid="envelope-adm-action"
                            >
                              <option value="retirada">Retirada (novo registro)</option>
                              <option value="devolucao">Devolucao (fecha existente)</option>
                            </select>
                          </label>
                          <label className="vshort-field">
                            <span>Quem pegou / devolveu</span>
                            <select
                              value={admUserAuthId}
                              onChange={(event) => setAdmUserAuthId(event.target.value)}
                              data-testid="envelope-adm-user"
                            >
                              <option value="">— manter o usuario logado —</option>
                              {admUsers
                                .filter((user) => user.auth_user_id)
                                .map((user) => (
                                  <option key={user.id} value={user.auth_user_id ?? ""}>
                                    {user.nome}
                                    {user.email ? ` (${user.email})` : ""}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="vshort-field">
                            <span>Data/hora (retroativo)</span>
                            <input
                              type="datetime-local"
                              value={admWhen}
                              onChange={(event) => setAdmWhen(event.target.value)}
                              data-testid="envelope-adm-when"
                            />
                          </label>
                          <label className="vshort-adm-toggle">
                            <input
                              type="checkbox"
                              checked={admShowHistory}
                              onChange={(event) => setAdmShowHistory(event.target.checked)}
                              data-testid="envelope-adm-history-toggle"
                            />
                            <span>Mostrar historico (incluir devolvidos)</span>
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="vshort-primary"
                    onClick={() => void submitRetirada()}
                    disabled={envBusy || !envCarroId}
                    data-testid="envelope-submit"
                  >
                    {isAdmin && admMode && admAction === "devolucao"
                      ? "Registrar devolucao"
                      : "Registrar retirada"}
                  </button>
                  </div>

                  {envCarroId ? (
                    <div className="vshort-list" data-testid="envelope-abertos">
                      <span className="vshort-list-title">Em posse de alguem</span>
                      {envAbertos.length === 0 ? (
                        <p className="vshort-empty">Nenhum item retirado para este veiculo.</p>
                      ) : (
                        envAbertos.map((row) => (
                          <div key={row.id} className="vshort-list-item">
                            <span>
                              {ITEM_LABEL[row.item] ?? row.item}
                              {isAdmin ? (
                                <small className="vshort-meta">
                                  {" "}
                                  · {renderUserName(row.usuario_auth_user_id)} · {formatDateTimeBr(row.retirado_em)}
                                </small>
                              ) : null}
                            </span>
                            <div className="vshort-row-actions">
                              <button
                                type="button"
                                className="vshort-secondary"
                                onClick={() => void submitDevolucao(row.id)}
                                disabled={envBusy}
                                data-testid={`envelope-devolver-${row.item}`}
                              >
                                Devolver
                              </button>
                              {isAdmin ? (
                                <>
                                  <button
                                    type="button"
                                    className="vshort-link"
                                    onClick={() => startEdit(row)}
                                    disabled={envBusy}
                                    data-testid={`envelope-edit-${row.id}`}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="vshort-danger"
                                    onClick={() => void submitDelete(row.id)}
                                    disabled={envBusy}
                                    data-testid={`envelope-delete-${row.id}`}
                                  >
                                    Excluir
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="vshort-list" data-testid="envelope-recentes">
                      <span className="vshort-list-title">Pendencias recentes</span>
                      {envRecentes.length === 0 ? (
                        <p className="vshort-empty">Nenhuma pendencia em aberto. Selecione um veiculo para registrar uma retirada.</p>
                      ) : (
                        <div className="vshort-list-scroll">
                          {envRecentes.map((row) => (
                          <div
                            key={`rec-${row.id}`}
                            className={`vshort-list-item vshort-hist ${row.status === "devolvido" ? "is-closed" : "is-open"}`}
                          >
                            <span>
                              <strong>{ITEM_LABEL[row.item] ?? row.item}</strong>
                              <small className="vshort-meta">
                                {" "}
                                · {row.carro_id ? carroLabelById.get(row.carro_id) ?? "Veiculo" : "Sem veiculo"}
                                {" · "}
                                {row.status === "devolvido" ? "Devolvido" : "Em posse"}
                                {isAdmin ? (
                                  <>
                                    {" · "}
                                    {renderUserName(row.usuario_auth_user_id)}
                                    {" · "}
                                    {formatDateTimeBr(row.retirado_em)}
                                    {row.devolvido_em ? ` → ${formatDateTimeBr(row.devolvido_em)}` : ""}
                                  </>
                                ) : null}
                              </small>
                            </span>
                            <div className="vshort-row-actions">
                              {row.status === "com_usuario" ? (
                                <button
                                  type="button"
                                  className="vshort-secondary"
                                  onClick={() => void submitDevolucao(row.id)}
                                  disabled={envBusy}
                                  data-testid={`envelope-recente-devolver-${row.id}`}
                                >
                                  Devolver
                                </button>
                              ) : null}
                              {isAdmin ? (
                                <>
                                  <button
                                    type="button"
                                    className="vshort-link"
                                    onClick={() => startEdit(row)}
                                    disabled={envBusy}
                                    data-testid={`envelope-recente-edit-${row.id}`}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="vshort-danger"
                                    onClick={() => void submitDelete(row.id)}
                                    disabled={envBusy}
                                    data-testid={`envelope-recente-delete-${row.id}`}
                                  >
                                    Excluir
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isAdmin && admShowHistory && envCarroId ? (
                    <div className="vshort-list" data-testid="envelope-historico">
                      <span className="vshort-list-title">Historico completo</span>
                      {envHistorico.length === 0 ? (
                        <p className="vshort-empty">Sem lancamentos.</p>
                      ) : (
                        envHistorico.map((row) => (
                          <div
                            key={`hist-${row.id}`}
                            className={`vshort-list-item vshort-hist ${row.status === "devolvido" ? "is-closed" : "is-open"}`}
                          >
                            <span>
                              <strong>{ITEM_LABEL[row.item] ?? row.item}</strong>
                              <small className="vshort-meta">
                                {" "}
                                · {row.status === "devolvido" ? "Devolvido" : "Em posse"}
                                {" · "}
                                {renderUserName(row.usuario_auth_user_id)}
                                {" · "}
                                {formatDateTimeBr(row.retirado_em)}
                                {row.devolvido_em ? ` → ${formatDateTimeBr(row.devolvido_em)}` : ""}
                              </small>
                            </span>
                            <div className="vshort-row-actions">
                              <button
                                type="button"
                                className="vshort-link"
                                onClick={() => startEdit(row)}
                                disabled={envBusy}
                                data-testid={`envelope-edit-${row.id}`}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="vshort-danger"
                                onClick={() => void submitDelete(row.id)}
                                disabled={envBusy}
                                data-testid={`envelope-delete-${row.id}`}
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {isAdmin && editingRowId && editingPatch ? (
                    <div className="vshort-edit-panel" data-testid="envelope-edit-panel">
                      <span className="vshort-list-title">Editar registro</span>
                      <div className="vshort-adm-grid">
                        <label className="vshort-field">
                          <span>Usuario</span>
                          <select
                            value={editingPatch.usuario_auth_user_id}
                            onChange={(event) =>
                              setEditingPatch({ ...editingPatch, usuario_auth_user_id: event.target.value })
                            }
                          >
                            <option value="">— sem usuario —</option>
                            {admUsers
                              .filter((user) => user.auth_user_id)
                              .map((user) => (
                                <option key={user.id} value={user.auth_user_id ?? ""}>
                                  {user.nome}
                                  {user.email ? ` (${user.email})` : ""}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="vshort-field">
                          <span>Status</span>
                          <select
                            value={editingPatch.status}
                            onChange={(event) =>
                              setEditingPatch({
                                ...editingPatch,
                                status: event.target.value as "com_usuario" | "devolvido"
                              })
                            }
                          >
                            <option value="com_usuario">Em posse</option>
                            <option value="devolvido">Devolvido</option>
                          </select>
                        </label>
                        <label className="vshort-field">
                          <span>Retirado em</span>
                          <input
                            type="datetime-local"
                            value={editingPatch.retirado_em}
                            onChange={(event) =>
                              setEditingPatch({ ...editingPatch, retirado_em: event.target.value })
                            }
                          />
                        </label>
                        <label className="vshort-field">
                          <span>Devolvido em</span>
                          <input
                            type="datetime-local"
                            value={editingPatch.devolvido_em}
                            disabled={editingPatch.status !== "devolvido"}
                            onChange={(event) =>
                              setEditingPatch({ ...editingPatch, devolvido_em: event.target.value })
                            }
                          />
                        </label>
                        <label className="vshort-field vshort-field-full">
                          <span>Observacao</span>
                          <textarea
                            rows={2}
                            value={editingPatch.observacao}
                            onChange={(event) =>
                              setEditingPatch({ ...editingPatch, observacao: event.target.value })
                            }
                          />
                        </label>
                      </div>
                      <div className="vshort-row-actions">
                        <button
                          type="button"
                          className="vshort-primary"
                          onClick={() => void submitEdit()}
                          disabled={envBusy}
                          data-testid="envelope-edit-save"
                        >
                          Salvar alteracoes
                        </button>
                        <button
                          type="button"
                          className="vshort-link"
                          onClick={cancelEdit}
                          disabled={envBusy}
                        >
                          Cancelar
                        </button>
                      </div>
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
                  <div
                    className={`vshort-postit-form is-compact ${editingPostitId ? "is-editing" : ""}`}
                    data-testid="postit-form"
                  >
                    <div className="vshort-postit-form-head">
                      <strong>{editingPostitId ? "Editar post-it" : "Novo post-it"}</strong>
                      {editingPostitId ? (
                        <button
                          type="button"
                          className="vshort-link"
                          onClick={resetPostitForm}
                          disabled={postBusy}
                          data-testid="postit-cancel-edit"
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>

                    <div className="vshort-row">
                      <label className="vshort-field">
                        <span>Veiculo</span>
                        <input
                          list="vshort-carros-post"
                          value={postCarroLabel}
                          placeholder="Placa ou nome"
                          data-testid="postit-carro"
                          disabled={Boolean(editingPostitId)}
                          onChange={(event) => setPostCarroLabel(event.target.value)}
                        />
                        {carroDatalist("vshort-carros-post")}
                      </label>
                      <label className="vshort-field vshort-field-tipo">
                        <span>Tipo</span>
                        <select
                          value={postTipo}
                          data-testid="postit-tipo"
                          onChange={(event) => setPostTipo(event.target.value as ObservacaoTipo)}
                        >
                          <option value="observacao">📝</option>
                          <option value="urgente">🔴</option>
                          <option value="fixo">📌</option>
                        </select>
                      </label>
                      <label className="vshort-field vshort-field-prazo">
                        <span>Prazo</span>
                        <input
                          type="date"
                          value={postPrazo}
                          data-testid="postit-prazo"
                          onChange={(event) => setPostPrazo(event.target.value)}
                        />
                      </label>
                    </div>

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

                    <label className="vshort-field">
                      <span>Texto</span>
                      <textarea
                        value={postTexto}
                        rows={editingPostitId ? 2 : 1}
                        placeholder="Escreva a observacao..."
                        data-testid="postit-texto"
                        onChange={(event) => setPostTexto(event.target.value)}
                      />
                    </label>

                    {editingPostitId ? (
                      <label className="vshort-field">
                        <span>Feedback de solucao (opcional)</span>
                        <textarea
                          value={postFeedback}
                          rows={2}
                          placeholder="Como foi/sera resolvido?"
                          data-testid="postit-feedback"
                          onChange={(event) => setPostFeedback(event.target.value)}
                        />
                      </label>
                    ) : null}

                    <div className="vshort-row-actions">
                      <button
                        type="button"
                        className="vshort-primary"
                        onClick={() => void submitPostit()}
                        disabled={postBusy || !postTexto.trim()}
                        data-testid="postit-submit"
                      >
                        {editingPostitId ? "Salvar alteracoes" : "Criar post-it"}
                      </button>
                      {editingPostitId && canResolvePostits ? (
                        <button
                          type="button"
                          className="vshort-secondary"
                          onClick={() => void submitResolver()}
                          disabled={postBusy}
                          data-testid="postit-resolve-with-feedback"
                          title={postFeedback.trim() ? "Resolver registrando o feedback" : "Resolver sem feedback"}
                        >
                          {postFeedback.trim() ? "Resolver com feedback" : "Resolver"}
                        </button>
                      ) : null}
                      {editingPostitId && isAdmin ? (
                        <button
                          type="button"
                          className="vshort-danger"
                          onClick={() => void submitDeletePostit()}
                          disabled={postBusy}
                          data-testid="postit-delete"
                          title="Excluir definitivamente este post-it"
                        >
                          Excluir
                        </button>
                      ) : null}
                    </div>
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
                            const isSelected = editingPostitId === row.id;
                            return (
                              <button
                                key={row.id}
                                type="button"
                                className={`vshort-pcard is-${row.tipo} ${isSelected ? "is-selected" : ""}`}
                                data-testid={`postit-card-${row.id}`}
                                onClick={() => startEditPostit(row)}
                                title="Clique para editar este post-it"
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
                                {row.feedback_solucao ? (
                                  <p className="vshort-pcard-feedback" title={row.feedback_solucao}>
                                    💡 {row.feedback_solucao}
                                  </p>
                                ) : null}
                              </button>
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
