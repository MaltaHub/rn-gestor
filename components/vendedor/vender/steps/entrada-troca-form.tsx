"use client";

import type { TrocaDraft } from "@/components/vendedor/vender/use-venda-draft";

/**
 * Sub-form do carro recebido na troca. A placa é obrigatória; o backend
 * completa os demais dados via consulta de placa e cadastra o veículo na loja
 * com documentos.origem = TROCA e valor_compra = valor da entrada.
 */
export function EntradaTrocaForm({
  troca,
  onChange
}: {
  troca: TrocaDraft;
  onChange: (changes: Partial<TrocaDraft>) => void;
}) {
  return (
    <div className="vender-troca-form" data-testid="vender-troca-form">
      <p className="vendedor-hint">
        O carro da troca será cadastrado na loja com origem TROCA e valor de compra igual ao valor da entrada.
      </p>
      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>Placa *</span>
          <input
            value={troca.placa}
            onChange={(event) => onChange({ placa: event.target.value.toUpperCase() })}
            placeholder="ABC1D23"
            maxLength={8}
            data-testid="vender-troca-placa"
          />
        </label>
        <label className="vendedor-field">
          <span>Modelo/nome</span>
          <input value={troca.nome} onChange={(event) => onChange({ nome: event.target.value })} placeholder="ONIX 1.0 LT" />
        </label>
      </div>
      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>Cor</span>
          <input value={troca.cor} onChange={(event) => onChange({ cor: event.target.value })} placeholder="PRATA" />
        </label>
        <label className="vendedor-field">
          <span>Ano fab.</span>
          <input inputMode="numeric" value={troca.anoFab} onChange={(event) => onChange({ anoFab: event.target.value })} placeholder="2018" />
        </label>
        <label className="vendedor-field">
          <span>Ano mod.</span>
          <input inputMode="numeric" value={troca.anoMod} onChange={(event) => onChange({ anoMod: event.target.value })} placeholder="2019" />
        </label>
        <label className="vendedor-field">
          <span>KM</span>
          <input inputMode="numeric" value={troca.hodometro} onChange={(event) => onChange({ hodometro: event.target.value })} placeholder="80000" />
        </label>
      </div>
      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>Chassi</span>
          <input value={troca.chassi} onChange={(event) => onChange({ chassi: event.target.value })} placeholder="Opcional" />
        </label>
        <label className="vendedor-field">
          <span>Renavam</span>
          <input value={troca.renavam} onChange={(event) => onChange({ renavam: event.target.value })} placeholder="Opcional" />
        </label>
      </div>
    </div>
  );
}
