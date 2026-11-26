"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBackupLink, saveBackupLink, type BackupLink, type BackupLinkCheck } from "@/components/admin/backup-api";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { confirmDialog } from "@/components/ui/dialog/confirm";
import type { CurrentActor, RequestAuth, Role } from "@/components/ui-grid/types";
import { AppFrame } from "@/components/workspace/app-frame";
import styles from "@/components/admin/backup.module.css";

type BackupLinkWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

type Notice = { tone: "ok" | "error"; text: string };

function formatMoment(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Falha inesperada.";
}

/** /admin/backup — link do Apps Script que recebe o espelho do banco. */
export function BackupLinkWorkspace({ actor, accessToken, devRole = null }: BackupLinkWorkspaceProps) {
  const requestAuth = useMemo<RequestAuth>(() => ({ accessToken, devRole }), [accessToken, devRole]);
  const [link, setLink] = useState<BackupLink | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<BackupLinkCheck | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"load" | "check" | "test" | "save" | null>("load");
  const isAdmin = actor.role === "ADMINISTRADOR";

  const load = useCallback(
    async (testar: boolean) => {
      setBusy(testar ? "check" : "load");
      try {
        const data = await fetchBackupLink(requestAuth, testar);
        setLink(data.link);
        setDraft((current) => current || data.link?.url || "");
        if (data.check) setStatus(data.check);
      } catch (error) {
        setNotice({ tone: "error", text: errorText(error) });
      } finally {
        setBusy(null);
      }
    },
    [requestAuth]
  );

  useEffect(() => {
    if (isAdmin) void load(true);
  }, [isAdmin, load]);

  async function testDraft() {
    setBusy("test");
    setNotice(null);
    try {
      const { check } = await saveBackupLink(requestAuth, draft, true);
      if (check) setNotice({ tone: check.ok ? "ok" : "error", text: check.message });
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const confirmed = await confirmDialog({
      title: "Trocar o link do backup?",
      message: "Todos os dados do backup passam a ser enviados para esse Apps Script. A troca fica registrada na auditoria.",
      confirmLabel: "Trocar link"
    });
    if (!confirmed) return;

    setBusy("save");
    setNotice(null);
    try {
      const data = await saveBackupLink(requestAuth, draft);
      setLink(data.link);
      setDraft(data.link?.url ?? draft);
      setStatus(data.check);
      setNotice({ tone: "ok", text: "Link salvo. Os próximos envios do backup já vão para ele." });
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  if (!isAdmin) {
    return (
      <AuthStatusCard
        title="Acesso restrito"
        description="A configuração do backup é exclusiva do administrador."
        error="Seu perfil não tem permissão para alterar o backup."
      >
        <Link href="/" className="btn">
          Voltar ao painel
        </Link>
      </AuthStatusCard>
    );
  }

  const unchanged = draft.trim() === (link?.url ?? "");

  return (
    <AppFrame actor={actor} title="Backup">
      <div className={styles.page} data-testid="backup-page">
        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <h2>Link do Apps Script</h2>
            <span
              className={styles.status}
              data-tone={busy === "check" || busy === "load" ? "wait" : status?.ok ? "ok" : status ? "error" : "wait"}
            >
              {busy === "check" || busy === "load" ? "Testando…" : status?.ok ? "Respondendo" : status ? "Com problema" : "Sem teste"}
            </span>
          </header>

          <p className={styles.hint}>
            Endereço <b>/exec</b> da implantação do Apps Script da planilha de backup
            (Implantar → Gerenciar implantações). O banco envia cada alteração para ele.
          </p>

          {status && !status.ok ? <p className={styles.problem}>{status.message}</p> : null}

          <label className={styles.field}>
            <span>Link</span>
            <input
              type="url"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              spellCheck={false}
              autoComplete="off"
              disabled={busy === "save"}
              data-testid="backup-link-input"
            />
          </label>

          <dl className={styles.meta}>
            <dt>Última troca</dt>
            <dd>{formatMoment(link?.atualizadoEm ?? null)}</dd>
          </dl>

          {notice ? (
            <p className={styles.notice} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
              {notice.text}
            </p>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={() => void testDraft()} disabled={busy !== null || !draft.trim()}>
              {busy === "test" ? "Testando…" : "Testar link"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void save()}
              disabled={busy !== null || !draft.trim() || unchanged}
              data-testid="backup-link-save"
            >
              {busy === "save" ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </section>

        <p className={styles.footnote}>
          Ao publicar uma <b>nova versão</b> na mesma implantação, o link não muda. Só troque aqui se
          criar uma implantação nova. A senha do webhook (WEBHOOK_TOKEN) não muda por esta tela.
        </p>
      </div>
    </AppFrame>
  );
}
