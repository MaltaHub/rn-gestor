"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { DOCUMENT_SLOTS, isSlotPresent, type DocumentSlot } from "@/components/files/document-slots";

type DocumentClassifyDialogProps = {
  files: File[];
  placa: string;
  /** Arquivos que já estão na pasta: marca (✓) os tipos já anexados. */
  existingFileNames?: string[];
  onConfirm: (slotsByIndex: (DocumentSlot | null)[]) => void;
  onCancel: () => void;
};

const SLOT_BY_KEY = new Map(DOCUMENT_SLOTS.map((slot) => [slot.key, slot]));

const SLOT_GROUPS = (() => {
  const groups = new Map<string, DocumentSlot[]>();
  for (const slot of DOCUMENT_SLOTS) {
    const bucket = groups.get(slot.group) ?? [];
    bucket.push(slot);
    groups.set(slot.group, bucket);
  }
  return Array.from(groups.entries());
})();

export function DocumentClassifyDialog({ files, placa, existingFileNames = [], onConfirm, onCancel }: DocumentClassifyDialogProps) {
  // Chave do slot escolhido por arquivo ("" = manter sem classificar).
  const [choices, setChoices] = useState<string[]>(() => files.map(() => ""));

  const resolvedSlots = useMemo(
    () => choices.map((key) => (key ? SLOT_BY_KEY.get(key) ?? null : null)),
    [choices]
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="docclass-overlay" data-testid="document-classify-dialog">
      <div className="docclass-dialog">
        <div className="docclass-head">
          <strong>Classificar documento(s)</strong>
          <span>
            Placa <b>{placa.toUpperCase()}</b> — escolha o que cada arquivo representa. O arquivo ganha um nome curto
            (ex.: crlv_virado_{placa.toLowerCase()}.pdf) e os tipos do processo registram os dados no veículo.
          </span>
        </div>

        <div className="docclass-body">
          {files.map((file, index) => (
            <label key={`${file.name}-${index}`} className="docclass-row">
              <span className="docclass-filename" title={file.name}>
                {file.name}
              </span>
              <select
                className="docclass-select"
                value={choices[index]}
                data-testid={`document-classify-select-${index}`}
                onChange={(event) => {
                  const next = [...choices];
                  next[index] = event.target.value;
                  setChoices(next);
                }}
              >
                <option value="">Manter sem classificar</option>
                {SLOT_GROUPS.map(([group, slots]) => (
                  <optgroup key={group} label={group}>
                    {slots.map((slot) => (
                      <option key={slot.key} value={slot.key}>
                        {isSlotPresent(slot, placa, existingFileNames) ? `✓ ${slot.label} (já anexado)` : slot.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {resolvedSlots[index]?.registra ? (
                <small className="docclass-hint" data-testid={`document-classify-hint-${index}`}>
                  → {resolvedSlots[index]?.registra}
                </small>
              ) : null}
            </label>
          ))}
        </div>

        <div className="docclass-actions">
          <button type="button" className="docclass-btn-secondary" onClick={onCancel} data-testid="document-classify-cancel">
            Cancelar
          </button>
          <button
            type="button"
            className="docclass-btn-primary"
            onClick={() => onConfirm(resolvedSlots)}
            data-testid="document-classify-confirm"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
