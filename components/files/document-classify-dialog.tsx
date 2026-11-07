"use client";

import { FocusDialog, dialogStyles } from "@/components/ui/dialog/focus-dialog";

import { useMemo, useState } from "react";

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

/** Última categoria escolhida: uploads seguidos do mesmo documento já vêm marcados. */
const LAST_SLOT_KEY = "rn-gestor.files.lastDocumentSlot.v1";

function readLastSlot() {
  try {
    const key = window.localStorage.getItem(LAST_SLOT_KEY) ?? "";
    return SLOT_BY_KEY.has(key) ? key : "";
  } catch {
    return "";
  }
}

function saveLastSlot(key: string) {
  try {
    window.localStorage.setItem(LAST_SLOT_KEY, key);
  } catch {
    // sem storage: só não lembra a categoria
  }
}

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
  const [remembered] = useState(readLastSlot);
  const [choices, setChoices] = useState<string[]>(() => files.map(() => remembered));

  const resolvedSlots = useMemo(
    () => choices.map((key) => (key ? SLOT_BY_KEY.get(key) ?? null : null)),
    [choices]
  );

  return (
    <FocusDialog
      open
      onClose={onCancel}
      title="Classificar documento(s)"
      subtitle={<>Placa <b>{placa.toUpperCase()}</b> — escolha o que cada arquivo representa. O arquivo ganha um nome curto (ex.: crlv_virado_{placa.toLowerCase()}.pdf) e os tipos do processo registram os dados no veículo.</>}
      size="md"
      testId="document-classify-dialog"
      closeOnBackdrop={false}
      footer={
        <>
          <button type="button" className={dialogStyles.btn} onClick={onCancel} data-testid="document-classify-cancel">
            Cancelar
          </button>
          <button
            type="button"
            className={`${dialogStyles.btn} ${dialogStyles.primary}`}
            onClick={() => {
              const last = [...choices].reverse().find(Boolean);
              if (last) saveLastSlot(last);
              onConfirm(resolvedSlots);
            }}
            data-testid="document-classify-confirm"
          >
            Enviar
          </button>
        </>
      }
    >
          {remembered ? (
            <small className={dialogStyles.hint} data-testid="document-classify-remembered">
              Já marcado com a última categoria usada ({SLOT_BY_KEY.get(remembered)?.label}). Troque se for outro documento.
            </small>
          ) : null}
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
    </FocusDialog>
  );
}
