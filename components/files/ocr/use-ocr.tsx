"use client";

import { useCallback, useEffect, useState } from "react";

import { applyOcrValues, listOcrTemplates } from "@/components/files/api";
import styles from "@/components/files/explorer/explorer.module.css";
import { Dialog } from "@/components/files/explorer/explorer-overlays";
import { readDocument } from "@/components/files/ocr/ocr-runtime";
import type { RequestAuth } from "@/components/ui-grid/types";
import { getOcrDestination } from "@/lib/domain/ocr/destinations";
import { fetchCarroById } from "@/components/ui-grid/api";
import { anchorLabel, checkAnchors, extractTemplate } from "@/lib/domain/ocr/engine";
import type { OcrAnchor, OcrAnchorResult, OcrAnchorVehicle, OcrDocument, OcrFieldResult, OcrTemplateSummary } from "@/lib/domain/ocr/types";
import { placasIguais } from "@/lib/domain/veiculo/identificacao";

type Notify = (kind: "info" | "error", text: string) => void;

export type OcrVehicleContext = { carroId: string | null; placa: string | null };

export type OcrCheckOutcome = { ok: true; anchors: OcrAnchorResult[] } | { ok: false; reason: string; anchors: OcrAnchorResult[] };

/** Valores ATUAIS do veículo (sempre frescos: o OCR acabou de poder alterá-los). */
export type OcrVehicleSnapshot = Record<string, unknown> & { placa?: string | null };

export async function loadVehicleSnapshot(auth: RequestAuth, carroId: string | null): Promise<OcrVehicleSnapshot | null> {
  if (!carroId) return null;
  try {
    return (await fetchCarroById({ requestAuth: auth, carroId })) as OcrVehicleSnapshot;
  } catch {
    return null;
  }
}

function anchorVehicleFrom(vehicle: OcrVehicleContext, snapshot: OcrVehicleSnapshot | null): OcrAnchorVehicle {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  return {
    placa: vehicle.placa ?? text(snapshot?.placa),
    chassi: text(snapshot?.chassi),
    renavam: text(snapshot?.renavam)
  };
}

export async function resolveAnchorVehicle(auth: RequestAuth, vehicle: OcrVehicleContext, anchors: OcrAnchor[]): Promise<OcrAnchorVehicle> {
  const needsMore = anchors.some((anchor) => anchor.kind === "vehicle" && anchor.field !== "placa");
  if (!needsMore || !vehicle.carroId) return { placa: vehicle.placa };
  return anchorVehicleFrom(vehicle, await loadVehicleSnapshot(auth, vehicle.carroId));
}

/** Valor lido diferente do que o veículo JÁ tem: nunca sobrescreve em silêncio. */
export type OcrConflict = { destination: string; label: string; current: string; next: string };

function comparable(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+(?=\d)/, "");
}

export function detectConflicts(template: OcrTemplateSummary, results: OcrFieldResult[], snapshot: OcrVehicleSnapshot | null): OcrConflict[] {
  if (!snapshot) return [];
  const conflicts: OcrConflict[] = [];
  for (const field of template.fields) {
    const destination = getOcrDestination(field.destination);
    if (destination.kind !== "write" || !destination.column) continue;
    const value = results.find((result) => result.fieldId === field.id)?.value;
    const current = snapshot[destination.column];
    if (!value || current === null || current === undefined || String(current).trim() === "") continue;
    if (destination.validate(value) !== null) continue;
    const next = destination.format(value);
    if (comparable(current) !== comparable(next)) {
      conflicts.push({ destination: field.destination, label: field.label, current: String(current), next: String(next) });
    }
  }
  return conflicts;
}

/** Frase do motivo do cancelamento por âncora. */
export function describeMissingAnchors(results: OcrAnchorResult[]) {
  return results
    .filter((result) => result.status === "missing")
    .map((result) =>
      result.anchor.kind === "text" ? `o documento não contém “${result.anchor.value}”` : `o documento não contém ${anchorLabel(result.anchor).toLowerCase().replace(" da pasta", "")} ${String(result.expected ?? "").toUpperCase()} da pasta`
    )
    .join("; ");
}

// Templates em cache de sessão: o upload consulta a cada arquivo.
let templatesCache: { value: OcrTemplateSummary[]; at: number } | null = null;
const TEMPLATES_TTL_MS = 60_000;

const TEMPLATES_CHANGED_EVENT = "rn-gestor:ocr-templates-changed";

/** Console salvou/excluiu: derruba o cache e avisa quem já tem a lista em memória. */
export function invalidateOcrTemplates() {
  templatesCache = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TEMPLATES_CHANGED_EVENT));
}

/** `fresh`: ignora o cache — upload e "Extrair dados" SEMPRE usam a versão atual do template. */
export async function loadOcrTemplates(auth: RequestAuth, options: { fresh?: boolean } = {}) {
  if (!options.fresh && templatesCache && Date.now() - templatesCache.at < TEMPLATES_TTL_MS) return templatesCache.value;
  const response = await listOcrTemplates(auth);
  // Defensivo: resposta inesperada vira lista vazia (o menu/upload não podem quebrar).
  const templates = Array.isArray(response?.templates) ? response.templates : [];
  templatesCache = { value: templates, at: Date.now() };
  return templates;
}

export function activeTemplateFor(templates: OcrTemplateSummary[], documentTypeKey: string | null | undefined) {
  if (!documentTypeKey) return null;
  return templates.find((template) => template.active && template.documentTypeKey === documentTypeKey && template.fields.length > 0) ?? null;
}

/**
 * Trava: 1) ÂNCORAS — o documento precisa conter os valores do veículo da pasta
 * (e os textos fixos); 2) campos "conferir placa" precisam bater com a pasta.
 */
export function checkResults(
  template: OcrTemplateSummary,
  results: OcrFieldResult[],
  vehicle: OcrVehicleContext,
  anchors: OcrAnchorResult[] = []
): OcrCheckOutcome {
  if (anchors.some((result) => result.status === "missing")) {
    return { ok: false, reason: describeMissingAnchors(anchors), anchors };
  }
  for (const field of template.fields) {
    const destination = getOcrDestination(field.destination);
    if (destination.kind !== "check") continue;
    const value = results.find((result) => result.fieldId === field.id)?.value ?? null;
    if (!value) {
      if (field.required) return { ok: false, reason: `não consegui ler "${field.label}"`, anchors };
      continue;
    }
    if (destination.column === "placa" && vehicle.placa && !placasIguais(value, vehicle.placa)) {
      return { ok: false, reason: `placa ${value.toUpperCase()} ≠ pasta ${vehicle.placa.toUpperCase()}`, anchors };
    }
  }
  return { ok: true, anchors };
}

function writeValues(template: OcrTemplateSummary, results: OcrFieldResult[]) {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    const destination = getOcrDestination(field.destination);
    const value = results.find((result) => result.fieldId === field.id)?.value;
    if (destination.kind === "write" && value) values[field.destination] = value;
  }
  return values;
}

type PendingApply = {
  template: OcrTemplateSummary;
  results: OcrFieldResult[];
  vehicle: OcrVehicleContext;
  fileName: string;
  anchors: OcrAnchorResult[];
  conflicts: OcrConflict[];
};

function OcrApplyDialog({
  pending,
  saving,
  onApply,
  onClose
}: {
  pending: PendingApply;
  saving: boolean;
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const { template, results, vehicle } = pending;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.fields.map((field) => [field.id, results.find((result) => result.fieldId === field.id)?.value ?? ""]))
  );

  const rows = template.fields.map((field) => {
    const destination = getOcrDestination(field.destination);
    const value = values[field.id]?.trim() ?? "";
    const result = results.find((entry) => entry.fieldId === field.id);
    const problem = value ? destination.validate(value) : field.required ? "Obrigatório." : null;
    const checkFails = destination.kind === "check" && destination.column === "placa" && value && vehicle.placa && !placasIguais(value, vehicle.placa);
    return { field, destination, value, result, problem: checkFails ? "Não confere com a pasta." : problem };
  });

  const writable = rows.filter((row) => row.destination.kind === "write" && row.value && !row.problem);
  const blocking = rows.some((row) => row.problem && (row.field.required || row.destination.kind === "check"));
  const canSave = Boolean(vehicle.carroId) && !blocking && (writable.length > 0 || template.markReady);

  return (
    <Dialog
      title={`Dados lidos — ${template.name}`}
      onClose={onClose}
      wide
      testId="ocr-apply-dialog"
      footer={
        <>
          <span className={styles.flexSpacer} />
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={saving}>
            Não gravar
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!canSave || saving}
            onClick={() => onApply(Object.fromEntries(writable.map((row) => [row.field.destination, row.value])))}
            data-testid="ocr-apply-save"
          >
            {saving ? "Gravando…" : "Gravar no veículo"}
          </button>
        </>
      }
    >
      <p className={styles.paneHint}>
        {pending.fileName}
        {vehicle.placa ? ` · veículo ${vehicle.placa.toUpperCase()}` : ""}. Revise antes de gravar — o OCR pode errar.
        {template.markReady ? " Ao gravar, o veículo é marcado como PRONTO." : ""}
      </p>
      {!vehicle.carroId ? <p className={styles.paneHint}>Esta pasta não é de um veículo: os dados só podem ser conferidos.</p> : null}
      {pending.conflicts.length > 0 ? (
        <div className={styles.lockNotice} data-testid="ocr-apply-conflicts">
          <span>
            ⚠ O veículo já tem valores diferentes dos lidos ({pending.conflicts.map((conflict) => conflict.label).join(", ")}). Confira se o documento é
            deste veículo antes de gravar — por isso a gravação automática foi suspensa.
          </span>
        </div>
      ) : null}
      {pending.anchors.length > 0 ? (
        <div className={styles.chips} data-testid="ocr-apply-anchors">
          {pending.anchors.map((result, position) => (
            <span key={position} className={`${styles.chip} ${result.status === "ok" ? styles.chipOn : ""}`}>
              {result.status === "ok" ? "✓" : result.status === "skipped" ? "–" : "✗"} {anchorLabel(result.anchor)}
              {result.expected && result.anchor.kind === "vehicle" ? ` (${String(result.expected).toUpperCase()})` : ""}
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.formGrid}>
        {rows.map((row) => (
          <label key={row.field.id} className={styles.field}>
            <span>
              {row.field.label} <small>→ {row.destination.label}</small>
            </span>
            {row.field.mode === "area" ? (
              <textarea
                rows={Math.min(8, Math.max(2, (values[row.field.id] ?? "").split("\n").length))}
                value={values[row.field.id] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [row.field.id]: event.target.value }))}
                className={styles.textarea}
                data-testid={`ocr-apply-area-${row.field.id}`}
              />
            ) : (
              <input
                value={values[row.field.id] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [row.field.id]: event.target.value }))}
                aria-invalid={Boolean(row.problem)}
                data-testid={`ocr-apply-${row.field.destination}`}
              />
            )}
            {(() => {
              const conflict = pending.conflicts.find((entry) => entry.destination === row.field.destination);
              return conflict ? (
                <small className={styles.dangerText} data-testid={`ocr-apply-conflict-${row.field.destination}`}>
                  Atual no veículo: {conflict.current}
                </small>
              ) : null;
            })()}
            <small>
              {row.problem
                ? `⚠ ${row.problem}`
                : row.result?.source === "region"
                  ? "Lido na posição do exemplo."
                  : row.result?.source === "wildcard"
                    ? "Encontrado pelas regras coringa."
                    : row.value
                      ? "Digitado."
                      : "Não encontrado."}
            </small>
          </label>
        ))}
      </div>
    </Dialog>
  );
}

/** Extração + âncoras + trava + conflitos sobre um documento já lido (usado também pelo console). */
export async function evaluate(auth: RequestAuth, document: OcrDocument, template: OcrTemplateSummary, vehicle: OcrVehicleContext) {
  const results = extractTemplate(document, template);
  const snapshot = await loadVehicleSnapshot(auth, vehicle.carroId);
  const anchors = checkAnchors(document, template.anchors, anchorVehicleFrom(vehicle, snapshot));
  return {
    results,
    anchors,
    conflicts: detectConflicts(template, results, snapshot),
    check: checkResults(template, results, vehicle, anchors)
  };
}

/**
 * Aplicação de templates: lê o arquivo no navegador, extrai, confere as
 * âncoras e a trava e grava (direto no modo automático ou após confirmação).
 */
export function useOcrApply({ auth, notify }: { auth: RequestAuth; notify: Notify }) {
  const [pending, setPending] = useState<PendingApply | null>(null);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<OcrTemplateSummary[]>(templatesCache?.value ?? []);

  /** Lista atual do servidor (sem cache) — usada antes de cada upload/extração. */
  const refresh = useCallback(async () => {
    try {
      const fresh = await loadOcrTemplates(auth, { fresh: true });
      setTemplates(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, [auth]);

  useEffect(() => {
    loadOcrTemplates(auth)
      .then(setTemplates)
      .catch(() => setTemplates([]));
    const onChanged = () => void refresh();
    window.addEventListener(TEMPLATES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(TEMPLATES_CHANGED_EVENT, onChanged);
  }, [auth, refresh]);

  const apply = useCallback(
    async (target: PendingApply, values: Record<string, string>) => {
      if (!target.vehicle.carroId) return false;
      setSaving(true);
      try {
        const result = await applyOcrValues(auth, {
          carroId: target.vehicle.carroId,
          templateId: target.template.id,
          values,
          markReady: target.template.markReady
        });
        const count = Object.keys(result.applied).length;
        notify("info", `Veículo atualizado ✓ (${count} campo${count === 1 ? "" : "s"}${result.markedReady ? " · PRONTO" : ""}).`);
        return true;
      } catch (error) {
        notify("error", error instanceof Error ? error.message : "Falha ao gravar os dados.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [auth, notify]
  );

  /** Extrai de um arquivo local. Devolve o resultado da trava para quem decide o upload. */
  const extract = useCallback(
    async (file: Blob & { name?: string }, template: OcrTemplateSummary, vehicle: OcrVehicleContext) => {
      const { document } = await readDocument(file, { maxPages: 3 });
      return evaluate(auth, document, template, vehicle);
    },
    [auth]
  );

  /** Depois de aceito: grava sozinho (modo automático e tudo válido) ou abre a confirmação. */
  const present = useCallback(
    async (
      template: OcrTemplateSummary,
      results: OcrFieldResult[],
      vehicle: OcrVehicleContext,
      fileName: string,
      anchors: OcrAnchorResult[] = [],
      conflicts: OcrConflict[] = []
    ) => {
      const values = writeValues(template, results);
      const target = { template, results, vehicle, fileName, anchors, conflicts };
      if (Object.keys(values).length === 0 && !template.markReady) {
        notify("info", `${template.name}: nada para gravar.`);
        return;
      }
      const allValid = template.fields.every((field) => {
        const destination = getOcrDestination(field.destination);
        const value = results.find((result) => result.fieldId === field.id)?.value;
        return destination.kind !== "write" || (value ? destination.validate(value) === null : !field.required);
      });
      // Automático só sem conflito: valor diferente do que o veículo já tem pede confirmação.
      if (template.applyMode === "auto" && allValid && conflicts.length === 0 && vehicle.carroId) {
        await apply(target, values);
        return;
      }
      setPending(target);
    },
    [apply, notify]
  );

  const dialog = pending ? (
    <OcrApplyDialog
      key={`${pending.template.id}-${pending.fileName}`}
      pending={pending}
      saving={saving}
      onClose={() => setPending(null)}
      onApply={(values) =>
        void apply(pending, values).then((ok) => {
          if (ok) setPending(null);
        })
      }
    />
  ) : null;

  return { templates, refresh, extract, present, dialog };
}
