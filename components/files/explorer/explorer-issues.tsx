"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchInconsistencies, reconcileAutomations } from "@/components/files/api";
import styles from "@/components/files/explorer/explorer.module.css";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { getFolderPathLabel, type ExplorerModel } from "@/components/files/explorer/model";
import type { RequestAuth } from "@/components/ui-grid/types";
import {
  INCONSISTENCY_KINDS,
  INCONSISTENCY_LABELS,
  RECONCILABLE_KINDS,
  type Inconsistency,
  type InconsistencyKind
} from "@/lib/domain/file-automations/inconsistencies";
import type { ExplorerFolder } from "@/lib/files/explorer-types";

type Notify = (kind: "info" | "error", text: string) => void;

/**
 * Filtro de inconsistências: veículo sem pasta, automação pausada, pasta fora
 * do lugar pelas regras, estoque sem fotos... com correção no próprio item.
 */
export function ExplorerIssues({
  auth,
  model,
  canManage,
  notify,
  onNavigate,
  onClose,
  onChanged,
  onToggleAutomation,
  filter,
  onFilterChange
}: {
  auth: RequestAuth;
  model: ExplorerModel;
  canManage: boolean;
  notify: Notify;
  onNavigate: (folderId: string) => void;
  onClose: () => void;
  onChanged: () => void;
  onToggleAutomation: (folder: ExplorerFolder) => Promise<void>;
  /** Filtro controlado (também escolhido pelo botão de filtro da pesquisa). */
  filter: InconsistencyKind | "all";
  onFilterChange: (filter: InconsistencyKind | "all") => void;
}) {
  const [issues, setIssues] = useState<Inconsistency[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { issues: next } = await fetchInconsistencies(auth);
      setIssues(next);
    } catch (error) {
      setIssues([]);
      notify("error", error instanceof Error ? error.message : "Falha ao verificar inconsistências.");
    }
  }, [auth, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map = new Map<InconsistencyKind, number>();
    for (const issue of issues ?? []) map.set(issue.kind, (map.get(issue.kind) ?? 0) + 1);
    return map;
  }, [issues]);

  const shown = (issues ?? []).filter((issue) => filter === "all" || issue.kind === filter);
  const fixable = Array.from(new Set(shown.filter((issue) => RECONCILABLE_KINDS.has(issue.kind) && issue.carroId).map((issue) => issue.carroId as string)));

  // Rótulo do veículo: o índice já tem placa/modelo das pastas gerenciadas.
  const vehicleLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of model.foldersById.values()) {
      if (folder.managedCarroId && folder.vehicle) map.set(folder.managedCarroId, folder.vehicle.label);
    }
    return map;
  }, [model]);

  const fixCar = async (carroId: string) => {
    setBusy((current) => new Set(current).add(carroId));
    try {
      await reconcileAutomations(auth, carroId);
      return true;
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao corrigir.");
      return false;
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(carroId);
        return next;
      });
    }
  };

  const fixOne = async (carroId: string) => {
    if (await fixCar(carroId)) {
      notify("info", "Pastas do veículo corrigidas pelas regras.");
      onChanged();
      await load();
    }
  };

  const fixAll = async () => {
    let done = 0;
    for (const [position, carroId] of fixable.entries()) {
      setBulk(`Corrigindo ${position + 1} de ${fixable.length}…`);
      if (await fixCar(carroId)) done += 1;
    }
    setBulk(null);
    notify("info", `${done} veículo(s) corrigido(s).`);
    onChanged();
    await load();
  };

  return (
    <div className={styles.issues} data-testid="explorer-issues">
      <div className={styles.issuesHead}>
        <Icon name="alert" size={16} />
        <strong>Inconsistências</strong>
        <span className={styles.statusHint}>{issues ? `${issues.length} encontrada(s)` : "Verificando…"}</span>
        <span className={styles.flexSpacer} />
        {canManage && fixable.length > 0 ? (
          <button type="button" className={styles.primaryBtn} onClick={() => void fixAll()} disabled={bulk !== null} data-testid="issues-fix-all">
            {bulk ?? `Corrigir todas (${fixable.length})`}
          </button>
        ) : null}
        <button type="button" className={styles.iconBtn} onClick={() => void load()} title="Verificar de novo" aria-label="Verificar de novo">
          <Icon name="refresh" />
        </button>
        <button type="button" className={styles.iconBtn} onClick={onClose} title="Voltar às pastas" aria-label="Fechar">
          <Icon name="close" />
        </button>
      </div>

      <label className={styles.issuesFilter}>
        <span>Mostrar</span>
        <select value={filter} onChange={(event) => onFilterChange(event.target.value as InconsistencyKind | "all")} data-testid="issues-filter">
          <option value="all">Todas ({issues?.length ?? 0})</option>
          {INCONSISTENCY_KINDS.filter((kind) => counts.get(kind) || kind === filter).map((kind) => (
            <option key={kind} value={kind}>
              {INCONSISTENCY_LABELS[kind]} ({counts.get(kind) ?? 0})
            </option>
          ))}
        </select>
      </label>

      <div className={styles.issuesList}>
        {issues === null ? <p className={styles.paneHint}>Verificando veículos e pastas…</p> : null}
        {issues && shown.length === 0 ? <p className={styles.paneHint}>Nada fora do lugar. ✓</p> : null}
        {shown.map((issue, position) => {
          const folder = issue.folderId ? model.foldersById.get(issue.folderId) : undefined;
          const label = (issue.carroId && vehicleLabel.get(issue.carroId)) || issue.placa || folder?.displayName || "Pasta";
          return (
            <div key={`${issue.kind}-${issue.carroId ?? issue.folderId}-${position}`} className={styles.issueRow} data-kind={issue.kind}>
              <span className={styles.issueKind}>{INCONSISTENCY_LABELS[issue.kind]}</span>
              <span className={styles.issueMain}>
                <strong>{label}</strong>
                <small>
                  {issue.detail}
                  {folder ? ` · ${getFolderPathLabel(model, folder.id)}` : ""}
                </small>
              </span>
              <span className={styles.issueActions}>
                {folder ? (
                  <button type="button" className={styles.secondaryBtn} onClick={() => onNavigate(folder.id)}>
                    Abrir pasta
                  </button>
                ) : null}
                {canManage && issue.kind === "automation_paused" && folder ? (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => void onToggleAutomation(folder).then(load)}
                  >
                    Reativar automação
                  </button>
                ) : null}
                {canManage && RECONCILABLE_KINDS.has(issue.kind) && issue.carroId ? (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => void fixOne(issue.carroId as string)}
                    disabled={busy.has(issue.carroId) || bulk !== null}
                    title="Reaplica as regras de pastas neste veículo"
                  >
                    {busy.has(issue.carroId) ? "Corrigindo…" : "Corrigir"}
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
