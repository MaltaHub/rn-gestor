"use client";

import type { LookupItem } from "@/lib/core/types/lookups";
import type { DraftPatch, VendaDraft } from "@/components/vendedor/vender/use-venda-draft";

/** Passo 1: dados do cliente + canal e vendedor responsável. */
export function StepCliente({
  draft,
  patch,
  usuarios,
  canais,
  actorNome
}: {
  draft: VendaDraft;
  patch: (changes: DraftPatch) => void;
  usuarios: LookupItem[];
  canais: LookupItem[];
  actorNome: string | null;
}) {
  const vendedorMissing =
    draft.vendedorAuthUserId && !usuarios.some((item) => item.code === draft.vendedorAuthUserId);

  return (
    <div className="vender-step">
      <label className="vendedor-field">
        <span>Nome do cliente *</span>
        <input
          value={draft.compradorNome}
          onChange={(event) => patch({ compradorNome: event.target.value })}
          placeholder="Nome completo"
          data-testid="vender-cliente-nome"
        />
      </label>

      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>CPF/CNPJ</span>
          <input
            value={draft.compradorDocumento}
            onChange={(event) => patch({ compradorDocumento: event.target.value })}
            placeholder="000.000.000-00"
          />
        </label>
        <label className="vendedor-field">
          <span>RG</span>
          <input
            value={draft.compradorRg}
            onChange={(event) => patch({ compradorRg: event.target.value })}
            placeholder="00.000.000-0"
            data-testid="vender-cliente-rg"
          />
        </label>
        <label className="vendedor-field">
          <span>Telefone</span>
          <input
            value={draft.compradorTelefone}
            onChange={(event) => patch({ compradorTelefone: event.target.value })}
            placeholder="(84) 90000-0000"
          />
        </label>
      </div>

      <label className="vendedor-field">
        <span>E-mail</span>
        <input
          type="email"
          value={draft.compradorEmail}
          onChange={(event) => patch({ compradorEmail: event.target.value })}
          placeholder="cliente@email.com"
        />
      </label>

      <label className="vendedor-field">
        <span>Endereço</span>
        <input
          value={draft.compradorEndereco}
          onChange={(event) => patch({ compradorEndereco: event.target.value })}
          placeholder="Rua, número, bairro"
        />
      </label>

      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>CEP</span>
          <input
            value={draft.compradorCep}
            onChange={(event) => patch({ compradorCep: event.target.value })}
            placeholder="59000-000"
            data-testid="vender-cliente-cep"
          />
        </label>
        <label className="vendedor-field">
          <span>Cidade - Estado</span>
          <input
            value={draft.compradorCidadeEstado}
            onChange={(event) => patch({ compradorCidadeEstado: event.target.value })}
            placeholder="Natal - RN"
            data-testid="vender-cliente-cidade-estado"
          />
        </label>
      </div>

      <label className="vendedor-field vender-field-debitos">
        <span>Débitos do veículo (IPVA, multas)</span>
        <textarea
          value={draft.debitos}
          rows={2}
          onChange={(event) => patch({ debitos: event.target.value })}
          placeholder="Opcional — ex.: IPVA 2025 em aberto, 1 multa"
          data-testid="vender-cliente-debitos"
        />
        <small>Destaque em vermelho — registre pendências do veículo, se houver.</small>
      </label>

      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>Canal do cliente</span>
          <select value={draft.canalCliente} onChange={(event) => patch({ canalCliente: event.target.value })}>
            <option value="">— Não informado —</option>
            {canais.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="vendedor-field">
          <span>Vendedor responsável *</span>
          <select
            value={draft.vendedorAuthUserId}
            onChange={(event) => patch({ vendedorAuthUserId: event.target.value })}
            data-testid="vender-cliente-vendedor"
          >
            {vendedorMissing ? <option value={draft.vendedorAuthUserId}>{actorNome ?? "Você"} (atual)</option> : null}
            {!draft.vendedorAuthUserId ? <option value="">Selecione...</option> : null}
            {usuarios.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
