"use client";

import { useEffect, useRef, useState } from "react";

import type { DocumentType } from "@/components/files/document-slots";

type DocumentSlotConfigProps = {
  type: DocumentType;
  placa: string;
  /** Estado atual do campo na ficha de documentos (se for tipo de estado). */
  currentState?: string | null;
  /** Anexa arquivo(s) classificados no tipo + estado escolhido. */
  onAttach: (type: DocumentType, value: string | null, files: File[]) => void;
  onClose: () => void;
};

export function DocumentSlotConfig({ type, placa, currentState, onAttach, onClose }: DocumentSlotConfigProps) {
  const [value, setValue] = useState<string>(type.values?.[0]?.value ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Ao trocar de tipo, default pro estado atual (se houver) ou o primeiro.
  useEffect(() => {
    if (currentState && type.values?.some((v) => v.value === currentState)) setValue(currentState);
    else setValue(type.values?.[0]?.value ?? "");
  }, [type, currentState]);

  const currentLabel = type.values?.find((v) => v.value === currentState)?.label ?? currentState ?? "—";

  return (
    <section className="docslot-config" data-testid="document-slot-config">
      <div className="docslot-config-head">
        <strong>{type.label}</strong>
        <button type="button" className="docslot-config-close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </div>

      <div className="docslot-config-placa">Veiculo {placa.toUpperCase()}</div>

      {type.campo && type.values ? (
        <>
          <div className="docslot-config-state">
            Estado atual: <b>{currentLabel}</b>
          </div>
          <label className="docslot-config-field">
            <span>Estado a registrar</span>
            <select value={value} data-testid="document-slot-config-state" onChange={(e) => setValue(e.target.value)}>
              {type.values.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <p className="docslot-config-hint">Documento organizacional — apenas anexa o arquivo na pasta.</p>
      )}

      <button
        type="button"
        className="docslot-config-attach"
        onClick={() => inputRef.current?.click()}
        data-testid="document-slot-config-attach"
      >
        Anexar arquivo
      </button>
      <p className="docslot-config-note">
        O arquivo e renomeado automaticamente e a automacao registra na ficha de documentos.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) onAttach(type, type.campo ? value : null, Array.from(files));
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </section>
  );
}
