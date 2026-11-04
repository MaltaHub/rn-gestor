"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchAutomationSettings, reconcileAutomations, updateAutomationSettings } from "@/components/files/api";
import styles from "@/components/files/explorer/explorer.module.css";
import { Dialog } from "@/components/files/explorer/explorer-overlays";
import { folderLabel, type ExplorerModel } from "@/components/files/explorer/model";
import type { RequestAuth } from "@/components/ui-grid/types";
import {
  DEFAULT_FILE_AUTOMATION_RULES,
  DISPLAY_TEMPLATE_TOKENS,
  describeRules,
  normalizeStateToken,
  renderDisplayTemplate,
  type FileAutomationRules
} from "@/lib/domain/file-automations/rules";
import type { FileAutomationRepositoryKey, VehicleFolderDisplayField } from "@/lib/files/explorer-types";

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

const TEMPLATE_PRESETS = ["{placa}", "{placa} · {modelo}", "{placa} · {modelo} {ano}", "{modelo} {ano} · {placa}"];

const SAMPLE_VEHICLE = { id: "c0ffee", placa: "ABC1D23", modelo: "ONIX 1.0 LT", ano: 2022, cor: "Prata", nome: "Onix da loja", chassi: "9BGKS48U0NG000000" };

type Tab = "rules" | "naming" | "repositories";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className={styles.toggleRow}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}

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
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("rules");
  const [displayField, setDisplayField] = useState<VehicleFolderDisplayField>("placa");
  const [repositories, setRepositories] = useState<Record<FileAutomationRepositoryKey, string> | null>(null);
  const [rules, setRules] = useState<FileAutomationRules>(DEFAULT_FILE_AUTOMATION_RULES);
  const [knownStates, setKnownStates] = useState<string[]>([]);
  const [customState, setCustomState] = useState("");
  const [busy, setBusy] = useState<"save" | "reconcile" | null>(null);

  useEffect(() => {
    let active = true;
    fetchAutomationSettings(auth)
      .then((value) => {
        if (!active) return;
        setDisplayField(value.displayField);
        setRepositories(value.repositories);
        setRules(value.rules ?? DEFAULT_FILE_AUTOMATION_RULES);
        setKnownStates(value.knownSaleStates ?? []);
        setLoaded(true);
      })
      .catch((error: unknown) => notify("error", error instanceof Error ? error.message : "Falha ao carregar automações."));
    return () => {
      active = false;
    };
  }, [auth, notify]);

  const roots = (model.childFolderIds.get(null) ?? [])
    .map((id) => model.foldersById.get(id))
    .filter((folder): folder is NonNullable<typeof folder> => Boolean(folder));

  const stateOptions = useMemo(() => {
    const byToken = new Map<string, string>();
    for (const state of [...knownStates, ...rules.soldStates]) {
      const token = normalizeStateToken(state);
      if (token && !byToken.has(token)) byToken.set(token, state);
    }
    return Array.from(byToken.values()).sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [knownStates, rules.soldStates]);

  const isSoldState = (state: string) => rules.soldStates.some((entry) => normalizeStateToken(entry) === normalizeStateToken(state));
  const toggleSoldState = (state: string) =>
    setRules((current) => ({
      ...current,
      soldStates: isSoldState(state)
        ? current.soldStates.filter((entry) => normalizeStateToken(entry) !== normalizeStateToken(state))
        : [...current.soldStates, state]
    }));

  const patchPhotos = (patch: Partial<FileAutomationRules["photos"]>) =>
    setRules((current) => ({ ...current, photos: { ...current.photos, ...patch } }));
  const patchDocuments = (patch: Partial<FileAutomationRules["documents"]>) =>
    setRules((current) => ({ ...current, documents: { ...current.documents, ...patch } }));

  const preview = rules.displayTemplate?.trim()
    ? renderDisplayTemplate(rules.displayTemplate, SAMPLE_VEHICLE)
    : String(SAMPLE_VEHICLE[displayField === "id" ? "id" : displayField] ?? "");

  const save = async (thenReconcile: boolean) => {
    if (!repositories) return;
    if (rules.soldStates.length === 0) {
      notify("error", "Escolha ao menos um estado de venda que conte como vendido.");
      setTab("rules");
      return;
    }
    setBusy(thenReconcile ? "reconcile" : "save");
    try {
      await updateAutomationSettings(auth, { displayField, repositories, rules });
      if (thenReconcile) {
        const result = await reconcileAutomations(auth);
        notify("info", `Regras salvas e aplicadas a ${result.processed} veículo(s).`);
      } else {
        notify("info", "Regras salvas. Valem a partir da próxima alteração de cada veículo.");
      }
      onSaved();
      onClose();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao salvar automações.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      title="Automação das pastas de veículos"
      onClose={onClose}
      wide
      testId="explorer-automation-dialog"
      footer={
        <>
          <span className={styles.flexSpacer} />
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={() => void save(false)} disabled={busy !== null || !loaded}>
            {busy === "save" ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void save(true)}
            disabled={busy !== null || !loaded}
            title="Salva e reaplica as regras em todos os veículos agora"
            data-testid="automation-save-reconcile"
          >
            {busy === "reconcile" ? "Aplicando…" : "Salvar e aplicar a todos"}
          </button>
        </>
      }
    >
      {!loaded || !repositories ? (
        <p className={styles.paneHint}>Carregando…</p>
      ) : (
        <>
          <div className={styles.tabs} role="tablist">
            {(
              [
                ["rules", "Regras"],
                ["naming", "Nome das pastas"],
                ["repositories", "Repositórios"]
              ] as Array<[Tab, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={`${styles.tab} ${tab === value ? styles.tabActive : ""}`}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "rules" ? (
            <div className={styles.formGrid}>
              <section className={styles.ruleSection}>
                <span className={styles.paneKicker}>O veículo conta como vendido quando o estado de venda é</span>
                <div className={styles.chips}>
                  {stateOptions.map((state) => (
                    <button
                      key={state}
                      type="button"
                      className={`${styles.chip} ${isSoldState(state) ? styles.chipOn : ""}`}
                      onClick={() => toggleSoldState(state)}
                      aria-pressed={isSoldState(state)}
                    >
                      {state}
                    </button>
                  ))}
                  <form
                    className={styles.chipAdd}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = customState.trim();
                      if (value && !isSoldState(value)) setRules((current) => ({ ...current, soldStates: [...current.soldStates, value] }));
                      setCustomState("");
                    }}
                  >
                    <input value={customState} onChange={(event) => setCustomState(event.target.value)} placeholder="+ outro estado" />
                  </form>
                </div>
              </section>

              <section className={styles.ruleSection}>
                <span className={styles.paneKicker}>Em estoque</span>
                <Toggle checked={rules.photos.createForStock} onChange={(value) => patchPhotos({ createForStock: value })} label="Criar pasta de fotos automaticamente" />
                <Toggle
                  checked={rules.documents.createForStock}
                  onChange={(value) => patchDocuments({ createForStock: value })}
                  label="Criar pasta de documentos automaticamente"
                  hint="Desligado: a pasta de documentos só nasce quando o veículo é vendido."
                />
              </section>

              <section className={styles.ruleSection}>
                <span className={styles.paneKicker}>Quando é vendido</span>
                <label className={styles.field}>
                  <span>Fotos</span>
                  <select value={rules.photos.onSold} onChange={(event) => patchPhotos({ onSold: event.target.value as FileAutomationRules["photos"]["onSold"] })}>
                    <option value="move">Mover para “Fotos de vendidos”</option>
                    <option value="keep">Manter onde estão</option>
                  </select>
                </label>
                <Toggle checked={rules.photos.deleteEmptyOnSold} onChange={(value) => patchPhotos({ deleteEmptyOnSold: value })} label="Apagar a pasta de fotos se estiver vazia" />
                <label className={styles.field}>
                  <span>Documentos</span>
                  <select
                    value={rules.documents.onSold}
                    onChange={(event) => patchDocuments({ onSold: event.target.value as FileAutomationRules["documents"]["onSold"] })}
                  >
                    <option value="move">Mover para “Documentos vendidos”</option>
                    <option value="keep">Manter onde estão</option>
                  </select>
                </label>
              </section>

              <section className={styles.ruleSection}>
                <span className={styles.paneKicker}>Quando o veículo é excluído</span>
                <label className={styles.field}>
                  <span>Documentos</span>
                  <select
                    value={rules.documents.onVehicleDelete}
                    onChange={(event) =>
                      patchDocuments({ onVehicleDelete: event.target.value as FileAutomationRules["documents"]["onVehicleDelete"] })
                    }
                  >
                    <option value="archive">Arquivar em “Documentos vendidos” (vazia é apagada)</option>
                    <option value="keep">Manter no lugar, desvinculada (vazia é apagada)</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Fotos</span>
                  <select
                    value={rules.photos.onVehicleDelete}
                    onChange={(event) => patchPhotos({ onVehicleDelete: event.target.value as FileAutomationRules["photos"]["onVehicleDelete"] })}
                  >
                    <option value="delete_if_empty">Manter as fotos no lugar (vazia é apagada)</option>
                    <option value="move_to_sold">Mover para “Fotos de vendidos” (vazia é apagada)</option>
                  </select>
                </label>
              </section>

              <section className={styles.ruleSection}>
                <span className={styles.paneKicker}>Capa</span>
                <Toggle
                  checked={rules.photos.autoCover}
                  onChange={(value) => patchPhotos({ autoCover: value })}
                  label="Usar a primeira foto como capa quando não houver capa"
                  hint="A ordem das fotos é a ordem manual da pasta (arraste para reordenar)."
                />
              </section>

              <section className={styles.ruleSummary} data-testid="automation-rules-summary">
                <span className={styles.paneKicker}>Como fica</span>
                <ul>
                  {describeRules(rules).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}

          {tab === "naming" ? (
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Campo padrão</span>
                <select value={displayField} onChange={(event) => setDisplayField(event.target.value as VehicleFolderDisplayField)}>
                  {DISPLAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small>Usado quando não há modelo personalizado (e como reserva se o modelo ficar vazio).</small>
              </label>
              <label className={styles.field}>
                <span>Modelo personalizado</span>
                <input
                  value={rules.displayTemplate ?? ""}
                  onChange={(event) => setRules((current) => ({ ...current, displayTemplate: event.target.value || null }))}
                  placeholder="ex.: {placa} · {modelo} {ano}"
                  data-testid="automation-display-template"
                />
                <small>Campos: {DISPLAY_TEMPLATE_TOKENS.map((token) => `{${token}}`).join(" ")}</small>
              </label>
              <div className={styles.chips}>
                {TEMPLATE_PRESETS.map((preset) => (
                  <button key={preset} type="button" className={styles.chip} onClick={() => setRules((current) => ({ ...current, displayTemplate: preset }))}>
                    {preset}
                  </button>
                ))}
              </div>
              <div className={styles.vehicleCard}>
                <span>
                  Exemplo: <strong data-testid="automation-display-preview">{preview || "—"}</strong>
                </span>
              </div>
            </div>
          ) : null}

          {tab === "repositories" ? (
            <div className={styles.formGrid}>
              {REPOSITORY_FIELDS.map((field) => (
                <label className={styles.field} key={field.key}>
                  <span>{field.label}</span>
                  <select
                    value={repositories[field.key]}
                    onChange={(event) => setRepositories((current) => (current ? { ...current, [field.key]: event.target.value } : current))}
                  >
                    <option value="">Selecione uma pasta raiz</option>
                    {roots.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folderLabel(folder)}
                      </option>
                    ))}
                  </select>
                  <small>{field.hint}</small>
                </label>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
