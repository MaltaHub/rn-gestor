"use client";

import type { TipoTransferencia } from "@/lib/domain/vendas/schemas";
import {
  VALOR_TRANSFERENCIA_LOJA_DEFAULT,
  type DraftPatch,
  type VendaDraft
} from "@/components/vendedor/vender/use-venda-draft";

const TIPO_OPTIONS: { value: TipoTransferencia; label: string; hint: string }[] = [
  { value: "loja", label: "Pela loja", hint: "A loja executa e cobra a transferência (padrão R$ 990,00)." },
  { value: "financiamento", label: "Pelo financiamento", hint: "O banco/financeira cuida da transferência." },
  { value: "cliente", label: "Pelo cliente", hint: "O próprio cliente transfere por conta dele." }
];

/** Passo 4: quem executa a transferência do veículo e por quanto. */
export function StepTransferencia({
  draft,
  patch
}: {
  draft: VendaDraft;
  patch: (changes: DraftPatch) => void;
}) {
  function selectTipo(tipo: TipoTransferencia) {
    // Ao escolher "pela loja", sugere o valor padrão se o campo estiver vazio
    // ou ainda com o default; outros tipos zeram a sugestão.
    if (tipo === "loja") {
      patch({
        tipoTransferencia: tipo,
        valorTransferencia: draft.valorTransferencia.trim() ? draft.valorTransferencia : VALOR_TRANSFERENCIA_LOJA_DEFAULT
      });
      return;
    }
    const isDefault = draft.valorTransferencia.trim() === VALOR_TRANSFERENCIA_LOJA_DEFAULT;
    patch({ tipoTransferencia: tipo, valorTransferencia: isDefault ? "" : draft.valorTransferencia });
  }

  return (
    <div className="vender-step">
      <fieldset className="vender-forma" data-testid="vender-transferencia">
        <legend>Transferência do veículo *</legend>
        <div className="vender-forma-options">
          {TIPO_OPTIONS.map((item) => (
            <label
              key={item.value}
              className={`vender-forma-option ${draft.tipoTransferencia === item.value ? "is-active" : ""}`.trim()}
            >
              <input
                type="radio"
                name="tipo_transferencia"
                value={item.value}
                checked={draft.tipoTransferencia === item.value}
                onChange={() => selectTipo(item.value)}
              />
              <span className="vender-forma-label">{item.label}</span>
              <span className="vender-forma-hint">{item.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="vendedor-field">
        <span>Valor da transferência (R$)</span>
        <input
          inputMode="decimal"
          value={draft.valorTransferencia}
          onChange={(event) => patch({ valorTransferencia: event.target.value })}
          placeholder={draft.tipoTransferencia === "loja" ? VALOR_TRANSFERENCIA_LOJA_DEFAULT : "Opcional"}
          data-testid="vender-transferencia-valor"
        />
      </label>

      <label className="vendedor-field">
        <span>Observação da venda</span>
        <textarea
          value={draft.observacao}
          rows={3}
          onChange={(event) => patch({ observacao: event.target.value })}
          placeholder="Detalhes combinados com o cliente, pendências, etc."
        />
      </label>
    </div>
  );
}
