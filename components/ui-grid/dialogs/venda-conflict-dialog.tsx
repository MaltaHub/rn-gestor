"use client";

import { FocusDialog } from "@/components/ui/dialog/focus-dialog";


import type { VendaConcluidaRow } from "@/components/ui-grid/api";

/**
 * Aparece quando o usuario muda estado_venda em um carro que ja possui venda
 * concluida ativa. Opcoes: cancelar (estorno — a venda some da contabilidade)
 * ou obsoletar (a venda ocorreu, mas o veiculo voltou pra loja).
 *
 * Apresentacional: todo o estado vive no HolisticSheet; aqui so entram valores
 * e callbacks. O guard de `submitting` no fechar fica no `onClose` do pai.
 */
export type VendaConflictAction = "cancelada" | "obsoleta";

type VendaConflictDialogProps = {
  open: boolean;
  venda: VendaConcluidaRow | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onResolve: (action: VendaConflictAction) => void;
};

function formatCurrency(value: unknown) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

export function VendaConflictDialog({
  open,
  venda,
  submitting,
  error,
  onClose,
  onResolve
}: VendaConflictDialogProps) {
  if (!open || !venda) return null;

  return (
    <FocusDialog
      open
      onClose={onClose}
      title="Venda concluida existente"
      subtitle="Este carro ja tem uma venda concluida. Decida o que fazer com a anterior antes de prosseguir."
      testId="venda-conflict-dialog"
      overlayTestId="venda-conflict-overlay"
      closeTestId="venda-conflict-close"
    >
            <label className="sheet-form-field">
              <span>Data da venda</span>
              <input type="text" value={venda.data_venda ?? "—"} readOnly />
            </label>
            <label className="sheet-form-field">
              <span>Valor total</span>
              <input type="text" value={formatCurrency(venda.valor_total)} readOnly />
            </label>
            <label className="sheet-form-field">
              <span>Forma de pagamento</span>
              <input type="text" value={venda.forma_pagamento ?? "—"} readOnly />
            </label>
            <label className="sheet-form-field">
              <span>Comprador</span>
              <input type="text" value={venda.comprador_nome ?? "—"} readOnly />
            </label>
            <p>
              <strong>Cancelar:</strong> a venda anterior some da contabilidade (foi um erro
              registrar).
              <br />
              <strong>Obsoletar:</strong> a venda ocorreu de fato, mas o veiculo voltou pra
              loja; a venda fica como historico e nao afeta mais a logica.
            </p>
            {error ? (
              <p className="sheet-error" data-testid="venda-conflict-error">
                {error}
              </p>
            ) : null}
            <div className="sheet-form-topbar-actions">
              <button
                type="button"
                className="sheet-form-submit"
                onClick={() => onResolve("cancelada")}
                disabled={submitting}
                data-testid="venda-conflict-cancel"
              >
                {submitting ? "Processando..." : "Cancelar venda anterior"}
              </button>
              <button
                type="button"
                className="sheet-form-submit"
                onClick={() => onResolve("obsoleta")}
                disabled={submitting}
                data-testid="venda-conflict-obsolete"
              >
                {submitting ? "Processando..." : "Marcar como obsoleta"}
              </button>
            </div>
    </FocusDialog>
  );
}
