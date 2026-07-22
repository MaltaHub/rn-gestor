"use client";

import type { FormEvent } from "react";
import { createPortal } from "react-dom";

import type { LookupsPayload } from "@/components/ui-grid/types";

/**
 * Registro de venda a partir do grid (escolhe vendedor + forma de pagamento;
 * demais campos sao opcionais e podem ser completados depois no grid de vendas).
 *
 * Apresentacional: o estado continua no HolisticSheet. Os campos entram como
 * `values` e os setters como `onChange` — dois objetos em vez de ~20 props
 * soltas, sem mudar o formato do estado no pai (extracao pura).
 */
export type VendaDialogFormaPagamento =
  | "financiamento"
  | "a_vista_pix"
  | "cartao_credito"
  | "consorcio";

export type VendaDialogValues = {
  vendedorAuthUserId: string;
  formaPagamento: VendaDialogFormaPagamento;
  dataVenda: string;
  dataEntrega: string;
  canalCliente: string;
  valorTotal: string;
  valorEntrada: string;
  compradorNome: string;
  compradorDocumento: string;
  observacao: string;
};

export type VendaDialogHandlers = {
  setVendedorAuthUserId: (value: string) => void;
  setFormaPagamento: (value: VendaDialogFormaPagamento) => void;
  setDataVenda: (value: string) => void;
  setDataEntrega: (value: string) => void;
  setCanalCliente: (value: string) => void;
  setValorTotal: (value: string) => void;
  setValorEntrada: (value: string) => void;
  setCompradorNome: (value: string) => void;
  setCompradorDocumento: (value: string) => void;
  setObservacao: (value: string) => void;
};

type VendaDialogProps = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  lookups: LookupsPayload | null;
  actorUserName: string;
  values: VendaDialogValues;
  onChange: VendaDialogHandlers;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export function VendaDialog({
  open,
  submitting,
  error,
  lookups,
  actorUserName,
  values,
  onChange,
  onSubmit,
  onClose
}: VendaDialogProps) {
  if (!open || typeof document === "undefined") return null;

  const usuarios = lookups?.usuarios ?? [];
  const canaisCliente = lookups?.canais_cliente ?? [];
  const vendedorForaDaLista =
    Boolean(values.vendedorAuthUserId) &&
    !usuarios.some((item) => item.code === values.vendedorAuthUserId);

  return createPortal(
    <div className="sheet-focus-overlay" data-testid="venda-dialog-overlay">
      <div className="sheet-focus-dialog" role="dialog" aria-modal="true" data-testid="venda-dialog">
        <form className="sheet-form-panel-shell" onSubmit={onSubmit}>
          <header className="sheet-focus-dialog-head">
            <div>
              <strong>Registrar venda</strong>
              <p>Escolha o vendedor responsavel. Demais campos podem ser preenchidos depois no grid de vendas.</p>
            </div>
            <button
              type="button"
              className="sheet-filter-clear-btn"
              onClick={onClose}
              data-testid="venda-dialog-close"
            >
              Fechar
            </button>
          </header>
          <div className="sheet-focus-dialog-body">
            <label className="sheet-form-field">
              <span>Vendedor *</span>
              <select
                value={values.vendedorAuthUserId}
                onChange={(event) => onChange.setVendedorAuthUserId(event.target.value)}
                data-testid="venda-dialog-vendedor"
              >
                {vendedorForaDaLista ? (
                  <option value={values.vendedorAuthUserId}>{actorUserName || "Voce"} (atual)</option>
                ) : null}
                {!values.vendedorAuthUserId ? <option value="">Selecione...</option> : null}
                {usuarios.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sheet-form-field">
              <span>Forma de pagamento *</span>
              <select
                value={values.formaPagamento}
                onChange={(event) =>
                  onChange.setFormaPagamento(event.target.value as VendaDialogFormaPagamento)
                }
                data-testid="venda-dialog-forma-pagamento"
              >
                <option value="financiamento">Financiamento</option>
                <option value="a_vista_pix">A vista no PIX</option>
                <option value="cartao_credito">Cartao de credito</option>
                <option value="consorcio">Consorcio</option>
              </select>
            </label>
            <label className="sheet-form-field">
              <span>Data da venda</span>
              <input
                type="date"
                value={values.dataVenda}
                onChange={(event) => onChange.setDataVenda(event.target.value)}
                data-testid="venda-dialog-data-venda"
              />
            </label>
            <label className="sheet-form-field">
              <span>Data de entrega</span>
              <input
                type="date"
                value={values.dataEntrega}
                onChange={(event) => onChange.setDataEntrega(event.target.value)}
                data-testid="venda-dialog-data-entrega"
                placeholder="Opcional"
              />
            </label>
            <label className="sheet-form-field">
              <span>Canal do cliente</span>
              <select
                value={values.canalCliente}
                onChange={(event) => onChange.setCanalCliente(event.target.value)}
                data-testid="venda-dialog-canal-cliente"
              >
                <option value="">— Nao informado —</option>
                {canaisCliente.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sheet-form-field">
              <span>Valor total</span>
              <input
                type="text"
                inputMode="decimal"
                value={values.valorTotal}
                onChange={(event) => onChange.setValorTotal(event.target.value)}
                data-testid="venda-dialog-valor-total"
                placeholder="Opcional"
              />
            </label>
            <label className="sheet-form-field">
              <span>Valor de entrada</span>
              <input
                type="text"
                inputMode="decimal"
                value={values.valorEntrada}
                onChange={(event) => onChange.setValorEntrada(event.target.value)}
                data-testid="venda-dialog-valor-entrada"
                placeholder="Opcional"
              />
            </label>
            <label className="sheet-form-field">
              <span>Nome do comprador</span>
              <input
                type="text"
                value={values.compradorNome}
                onChange={(event) => onChange.setCompradorNome(event.target.value)}
                data-testid="venda-dialog-comprador-nome"
                placeholder="Opcional"
              />
            </label>
            <label className="sheet-form-field">
              <span>Documento do comprador (CPF/CNPJ)</span>
              <input
                type="text"
                value={values.compradorDocumento}
                onChange={(event) => onChange.setCompradorDocumento(event.target.value)}
                data-testid="venda-dialog-comprador-documento"
                placeholder="Opcional"
              />
            </label>
            <label className="sheet-form-field">
              <span>Observacao</span>
              <textarea
                value={values.observacao}
                onChange={(event) => onChange.setObservacao(event.target.value)}
                rows={2}
                data-testid="venda-dialog-observacao"
                placeholder="Opcional"
              />
            </label>
            {error ? (
              <p className="sheet-error" data-testid="venda-dialog-error">
                {error}
              </p>
            ) : null}
            <div className="sheet-form-topbar-actions">
              <button
                type="submit"
                className="sheet-form-submit"
                data-testid="venda-dialog-submit"
                disabled={submitting}
              >
                {submitting ? "Registrando..." : "Registrar venda"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
