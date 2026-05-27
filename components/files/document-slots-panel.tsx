"use client";

import { useRef, useState } from "react";

import { DOCUMENT_SLOTS, isSlotPresent, type DocumentSlot } from "@/components/files/document-slots";

type DocumentSlotsPanelProps = {
  placa: string;
  /** Nomes dos arquivos da pasta atual (pra marcar o que ja foi anexado). */
  fileNames: string[];
  /** Anexa arquivos ja classificados num slot (sem pop-up). */
  onAttach: (slot: DocumentSlot, files: File[]) => void;
};

const SLOT_GROUPS = (() => {
  const groups = new Map<string, DocumentSlot[]>();
  for (const slot of DOCUMENT_SLOTS) {
    const bucket = groups.get(slot.group) ?? [];
    bucket.push(slot);
    groups.set(slot.group, bucket);
  }
  return Array.from(groups.entries());
})();

export function DocumentSlotsPanel({ placa, fileNames, onAttach }: DocumentSlotsPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<DocumentSlot | null>(null);
  const [open, setOpen] = useState(true);

  function pickFor(slot: DocumentSlot) {
    pendingSlotRef.current = slot;
    inputRef.current?.click();
  }

  return (
    <section className="docslots-panel" data-testid="document-slots-panel">
      <button type="button" className="docslots-head" onClick={() => setOpen((value) => !value)}>
        <strong>Documentos do veiculo</strong>
        <span>{open ? "Ocultar" : "Mostrar"}</span>
      </button>

      {open ? (
        <div className="docslots-groups">
          {SLOT_GROUPS.map(([group, slots]) => (
            <div key={group} className="docslots-group">
              <span className="docslots-group-title">{group}</span>
              {slots.map((slot) => {
                const present = isSlotPresent(slot, placa, fileNames);
                return (
                  <div
                    key={slot.key}
                    className={`docslots-item ${present ? "is-present" : ""}`}
                    data-testid={`document-slot-${slot.key}`}
                  >
                    <span className="docslots-item-dot" aria-hidden="true">
                      {present ? "✓" : "+"}
                    </span>
                    <span className="docslots-item-label">{slot.label}</span>
                    <button
                      type="button"
                      className="docslots-attach"
                      onClick={() => pickFor(slot)}
                      data-testid={`document-slot-attach-${slot.key}`}
                    >
                      Anexar
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const slot = pendingSlotRef.current;
          const files = event.target.files;
          if (slot && files && files.length > 0) {
            onAttach(slot, Array.from(files));
          }
          pendingSlotRef.current = null;
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </section>
  );
}
