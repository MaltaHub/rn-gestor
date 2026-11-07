"use client";

import { FocusDialog, dialogStyles } from "@/components/ui/dialog/focus-dialog";

import { useState } from "react";

import {
  formatChassi,
  formatRenavam,
  isRenavamFormat,
  isValidChassi,
  isValidRenavam
} from "@/lib/domain/veiculo/identificacao";

export type CrlvConfirmData = {
  /** Placa da pasta (já confere com a do documento — mostrada como ✓). */
  placa: string;
  chassi: string | null;
  renavam: string | null;
};

/**
 * Confirmação dos dados extraídos do CRLV antes de gravar no veículo. A placa já
 * passou na trava (bate com a pasta); aqui o usuário REVISA chassi/renavam (o OCR
 * pode errar) e decide gravar. Reaproveita os estilos `docclass-*`.
 */
export function CrlvConfirmDialog({
  data,
  saving,
  onConfirm,
  onSkip
}: {
  data: CrlvConfirmData;
  saving: boolean;
  onConfirm: (fields: { chassi: string | null; renavam: string | null }) => void;
  onSkip: () => void;
}) {
  const [chassi, setChassi] = useState(data.chassi ?? "");
  const [renavam, setRenavam] = useState(data.renavam ?? "");

  const chassiOk = !chassi.trim() || isValidChassi(chassi);
  const renavamOk = !renavam.trim() || isRenavamFormat(renavam);
  // DV é só um aviso (não bloqueia): o usuário está olhando o documento.
  const renavamDvAviso = renavam.trim() !== "" && renavamOk && !isValidRenavam(renavam);
  const nada = !chassi.trim() && !renavam.trim();

  return (
    <FocusDialog
      open
      onClose={onSkip}
      busy={saving}
      title="Confirmar dados do CRLV"
      subtitle={<>Placa <b>{data.placa.toUpperCase()}</b> ✓ confere com a pasta. Revise o chassi e o renavam lidos do documento antes de gravar — o OCR pode errar.</>}
      size="md"
      testId="crlv-confirm-dialog"
      closeOnBackdrop={false}
      footer={
        <>
          <button type="button" className={dialogStyles.btn} onClick={onSkip} disabled={saving} data-testid="crlv-confirm-skip">
            Não gravar
          </button>
          <button
            type="button"
            className={`${dialogStyles.btn} ${dialogStyles.primary}`}
            disabled={saving || nada || !chassiOk || !renavamOk}
            onClick={() => onConfirm({ chassi: chassi.trim() || null, renavam: renavam.trim() || null })}
            data-testid="crlv-confirm-save"
          >
            {saving ? "Gravando..." : "Gravar no veículo"}
          </button>
        </>
      }
    >
          <label className="docclass-row">
            <span className="docclass-filename">Chassi</span>
            <input
              className="docclass-select"
              value={chassi}
              onChange={(event) => setChassi(event.target.value.toUpperCase())}
              onBlur={(event) => setChassi(formatChassi(event.target.value))}
              placeholder="17 caracteres (sem I/O/Q)"
              data-testid="crlv-chassi-input"
              aria-invalid={!chassiOk}
            />
          </label>
          {!chassiOk ? <small className="docclass-warn">Chassi inválido — devem ser 17 caracteres.</small> : null}

          <label className="docclass-row">
            <span className="docclass-filename">Renavam</span>
            <input
              className="docclass-select"
              value={renavam}
              onChange={(event) => setRenavam(event.target.value)}
              onBlur={(event) => setRenavam(formatRenavam(event.target.value))}
              placeholder="11 dígitos"
              inputMode="numeric"
              data-testid="crlv-renavam-input"
              aria-invalid={!renavamOk}
            />
          </label>
          {!renavamOk ? <small className="docclass-warn">Renavam inválido — devem ser 11 dígitos.</small> : null}
          {renavamDvAviso ? <small className="docclass-warn">⚠ Dígito verificador não confere — confira no documento.</small> : null}
    </FocusDialog>
  );
}
