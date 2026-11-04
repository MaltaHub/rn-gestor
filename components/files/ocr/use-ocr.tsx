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

// Chassi/renavam do veículo só quando alguma âncora precisa (a placa já vem no índice).
const vehicleIdentityCache = new Map<string, OcrAnchorVehicle>();

export async function resolveAnchorVehicle(auth: RequestAuth, vehicle: OcrVehicleContext, anchors: OcrAnchor[]): Promise<OcrAnchorVehicle> {
  const base: OcrAnchorVehicle = { placa: vehicle.placa };
  const needsMore = anchors.some((anchor) => anchor.kind === "vehicle" && anchor.field !== "placa");
  if (!needsMore || !vehicle.carroId) return base;
  const cached = vehicleIdentityCache.get(vehicle.carroId);
  if (cached) return cached;
  try {
    const carro = await fetchCarroById({ requestAuth: auth, carroId: vehicle.carroId });
    const identity = {
      placa: vehicle.placa ?? carro.placa,
      chassi: typeof carro.chassi === "string" ? carro.chassi : null,
      renavam: typeof carro.renavam === "string" ? carro.renavam : null
    };
    vehicleIdentityCache.set(vehicle.carroId, identity);
    return identity;
  } catch {
    return base;
  }
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

export function invalidateOcrTemplates() {
  templatesCache = null;
}

export async function loadOcrTemplates(auth: RequestAuth) {
  if (templatesCache && Date.now() - templatesCache.at < TEMPLATES_TTL_MS) return templatesCache.value;
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

/** Extração + âncoras + trava sobre um documento já lido (usado também pelo console). */
export async function evaluate(auth: RequestAuth, document: OcrDocument, template: OcrTemplateSummary, vehicle: OcrVehicleContext) {
  const results = extractTemplate(document, template);
  const anchorVehicle = await resolveAnchorVehicle(auth, vehicle, template.anchors);
  const anchors = checkAnchors(document, template.anchors, anchorVehicle);
  return { results, anchors, check: checkResults(template, results, vehicle, anchors) };
}

/**
 * Aplicação de templates: lê o arquivo no navegador, extrai, confere as
 * âncoras e a trava e grava (direto no modo automático ou após confirmação).
 */
export function useOcrApply({ auth, notify }: { auth: RequestAuth; notify: Notify }) {
  const [pending, setPending] = useState<PendingApply | null>(null);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<OcrTemplateSummary[]>(templatesCache?.value ?? []);

  useEffect(() => {
    loadOcrTemplates(auth)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [auth]);

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
      anchors: OcrAnchorResult[] = []
    ) => {
      const values = writeValues(template, results);
      const target = { template, results, vehicle, fileName, anchors };
      if (Object.keys(values).length === 0 && !template.markReady) {
        notify("info", `${template.name}: nada para gravar.`);
        return;
      }
      const allValid = template.fields.every((field) => {
        const destination = getOcrDestination(field.destination);
        const value = results.find((result) => result.fieldId === field.id)?.value;
        return destination.kind !== "write" || (value ? destination.validate(value) === null : !field.required);
      });
      if (template.applyMode === "auto" && allValid && vehicle.carroId) {
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

  return { templates, extract, present, dialog };
}
