"use client";

import { useState } from "react";

import { DOCUMENT_TYPES, isTypePresent, type DocumentType } from "@/components/files/document-slots";

type DocumentSlotsPanelProps = {
  placa: string;
  /** Nomes dos arquivos da pasta atual (pra marcar o que ja foi anexado). */
  fileNames: string[];
  /** Tipo atualmente selecionado (config aparece na barra lateral direita). */
  selectedTypeKey: string | null;
  /** Seleciona um tipo de documento (abre a config no painel direito). */
  onSelectType: (type: DocumentType) => void;
};

export function DocumentSlotsPanel({ placa, fileNames, selectedTypeKey, onSelectType }: DocumentSlotsPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <section className="docslots-panel" data-testid="document-slots-panel">
      <button type="button" className="docslots-head" onClick={() => setOpen((value) => !value)}>
        <strong>Documentos do veiculo</strong>
        <span>{open ? "Ocultar" : "Mostrar"}</span>
      </button>

      {open ? (
        <div className="docslots-grid">
          {DOCUMENT_TYPES.map((type) => {
            const present = isTypePresent(type, placa, fileNames);
            const active = selectedTypeKey === type.key;
            return (
              <button
                type="button"
                key={type.key}
                className={`docslot-square ${present ? "is-present" : ""} ${active ? "is-active" : ""}`}
                onClick={() => onSelectType(type)}
                data-testid={`document-slot-${type.key}`}
                title={type.label}
              >
                <span className="docslot-square-dot" aria-hidden="true">
                  {present ? "✓" : "+"}
                </span>
                <span className="docslot-square-label">{type.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
