"use client";

import { useEffect, useState } from "react";

import { fetchAutomationSettings, reconcileAutomations, updateAutomationSettings } from "@/components/files/api";
import styles from "@/components/files/explorer/explorer.module.css";
import { Dialog } from "@/components/files/explorer/explorer-overlays";
import { folderLabel, type ExplorerModel } from "@/components/files/explorer/model";
import type { RequestAuth } from "@/components/ui-grid/types";
import type {
  FileAutomationRepositoryKey,
  FileAutomationSettings,
  VehicleFolderDisplayField
} from "@/lib/files/explorer-types";

const REPOSITORY_FIELDS: Array<{ key: FileAutomationRepositoryKey; label: string; hint: string }> = [
  { key: "vehicle_photos_active", label: "Fotos dos veículos", hint: "Pasta de fotos de cada veículo em estoque." },
  { key: "vehicle_photos_sold", label: "Fotos de vendidos", hint: "Para onde vão as fotos quando o veículo é vendido." },
  { key: "vehicle_documents_active", label: "Documentos", hint: "Pasta de documentos de cada veículo em estoque." },
  { key: "vehicle_documents_archive", label: "Documentos vendidos", hint: "Arquivo de documentos de vendidos/excluídos." }
];

const DISPLAY_OPTIONS: Array<{ value: VehicleFolderDisplayField; label: string }> = [
  { value: "placa", label: "Placa" },
  { value: "nome", label: "Nome" },
  { value: "chassi", label: "Chassi" },
  { value: "modelo", label: "Modelo" },
  { value: "id", label: "ID" }
];

export function AutomationSettingsDialog({
  auth,
  model,
  onClose,
  onSaved,
  notify
}: {
  auth: RequestAuth;
  model: ExplorerModel;
  onClose: () => void;
  onSaved: () => void;
  notify: (kind: "info" | "error", text: string) => void;
}) {
  const [settings, setSettings] = useState<FileAutomationSettings | null>(null);
  const [displayField, setDisplayField] = useState<VehicleFolderDisplayField>("placa");
  const [repositories, setRepositories] = useState<Record<FileAutomationRepositoryKey, string> | null>(null);
  const [busy, setBusy] = useState<"save" | "reconcile" | null>(null);

  useEffect(() => {
    let active = true;
    fetchAutomationSettings(auth)
      .then((value) => {
        if (!active) return;
        setSettings(value);
        setDisplayField(value.displayField);
        setRepositories(value.repositories);
      })
      .catch((error: unknown) => notify("error", error instanceof Error ? error.message : "Falha ao carregar automações."));
    return () => {
      active = false;
    };
  }, [auth, notify]);

  const roots = (model.childFolderIds.get(null) ?? []).map((id) => model.foldersById.get(id)).filter(Boolean);

  const save = async () => {
    if (!repositories) return;
    setBusy("save");
    try {
      await updateAutomationSettings(auth, { displayField, repositories });
      notify("info", "Automações atualizadas.");
      onSaved();
      onClose();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao salvar automações.");
    } finally {
      setBusy(null);
    }
  };

  const reconcile = async () => {
    setBusy("reconcile");
    try {
      const result = await reconcileAutomations(auth);
      notify("info", `${result.processed} veículo(s) reconciliado(s).`);
      onSaved();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao reconciliar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      title="Automações de pastas de veículos"
      onClose={onClose}
      wide
      testId="explorer-automation-dialog"
      footer={
        <>
          <button type="button" className={styles.secondaryBtn} onClick={() => void reconcile()} disabled={busy !== null || !settings}>
            {busy === "reconcile" ? "Reconciliando…" : "Reconciliar agora"}
          </button>
          <span className={styles.flexSpacer} />
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={styles.primaryBtn} onClick={() => void save()} disabled={busy !== null || !repositories}>
            {busy === "save" ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      {!settings || !repositories ? (
        <p className={styles.paneHint}>Carregando…</p>
      ) : (
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Exibir pastas de veículo como</span>
            <select value={displayField} onChange={(event) => setDisplayField(event.target.value as VehicleFolderDisplayField)}>
              {DISPLAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {REPOSITORY_FIELDS.map((field) => (
            <label className={styles.field} key={field.key}>
              <span>{field.label}</span>
              <select
                value={repositories[field.key]}
                onChange={(event) => setRepositories((current) => (current ? { ...current, [field.key]: event.target.value } : current))}
              >
                <option value="">Selecione uma pasta raiz</option>
                {roots.map((folder) =>
                  folder ? (
                    <option key={folder.id} value={folder.id}>
                      {folderLabel(folder)}
                    </option>
                  ) : null
                )}
              </select>
              <small>{field.hint}</small>
            </label>
          ))}
        </div>
      )}
    </Dialog>
  );
}
