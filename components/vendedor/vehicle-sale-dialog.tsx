"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiClientError,
  createVenda,
  fetchLookups,
  type CreateVendaQuickPayload
} from "@/components/ui-grid/api";
import { useAuthSessionState } from "@/components/auth/auth-provider";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import type { LookupItem } from "@/lib/core/types/lookups";

type FormaPagamento = CreateVendaQuickPayload["forma_pagamento"];

const FORMA_OPTIONS: { value: FormaPagamento; label: string }[] = [
  { value: "a_vista", label: "A vista" },
  { value: "financiado", label: "Financiado" },
  { value: "consorcio", label: "Consorcio" },
  { value: "parcelado", label: "Parcelado" },
  { value: "misto", label: "Misto" }
];

function parseDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function VehicleSaleDialog({
  carroId,
  carroName,
  onClose,
  onCreated
}: {
  carroId: string;
  carroName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const auth = useVendedorAuth();
  const { actor } = useAuthSessionState();
  const [usuarios, setUsuarios] = useState<LookupItem[]>([]);
  const [canais, setCanais] = useState<LookupItem[]>([]);
  const [vendedor, setVendedor] = useState(actor?.authUserId ?? "");
  const [forma, setForma] = useState<FormaPagamento>("a_vista");
  const [dataVenda, setDataVenda] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [canal, setCanal] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [valorEntrada, setValorEntrada] = useState("");
  const [compradorNome, setCompradorNome] = useState("");
  const [compradorDoc, setCompradorDoc] = useState("");
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchLookups(auth)
      .then((data) => {
        if (!active) return;
        setUsuarios(data.usuarios);
        setCanais(data.canais_cliente);
      })
      .catch(() => {
        /* selects continuam utilizáveis com o usuário atual */
      });
    return () => {
      active = false;
    };
  }, [auth]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!vendedor.trim()) {
      setError("Selecione o vendedor responsavel.");
      return;
    }
    const valorTotalParsed = parseDecimal(valorTotal);
    const valorEntradaParsed = parseDecimal(valorEntrada);
    if (Number.isNaN(valorTotalParsed) || Number.isNaN(valorEntradaParsed)) {
      setError("Valor invalido. Use numero com decimais (ex.: 50000,00).");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createVenda({
        requestAuth: auth,
        payload: {
          carro_id: carroId,
          vendedor_auth_user_id: vendedor.trim(),
          forma_pagamento: forma,
          data_venda: dataVenda.trim() || undefined,
          data_entrega: dataEntrega.trim() || null,
          canal_cliente: canal.trim() || null,
          valor_total: valorTotalParsed,
          valor_entrada: valorEntradaParsed,
          comprador_nome: compradorNome.trim() || null,
          comprador_documento: compradorDoc.trim() || null,
          observacao: observacao.trim() || null
        }
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao registrar venda.");
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === "undefined") return null;

  const currentVendedorMissing = vendedor && !usuarios.some((item) => item.code === vendedor);

  return createPortal(
    <div className="vendedor-modal-overlay" data-testid="vendedor-sale-overlay">
      <div className="vendedor-modal" role="dialog" aria-modal="true">
        <form onSubmit={submit}>
          <header className="vendedor-modal-head">
            <div>
              <strong>Registrar venda</strong>
              <p>{carroName}</p>
            </div>
            <button type="button" className="vendedor-btn-ghost" onClick={onClose} disabled={submitting}>
              Fechar
            </button>
          </header>

          <div className="vendedor-modal-body">
            <label className="vendedor-field">
              <span>Vendedor *</span>
              <select value={vendedor} onChange={(event) => setVendedor(event.target.value)} data-testid="vendedor-sale-vendedor">
                {currentVendedorMissing ? <option value={vendedor}>{actor?.userName ?? "Voce"} (atual)</option> : null}
                {!vendedor ? <option value="">Selecione...</option> : null}
                {usuarios.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="vendedor-field">
              <span>Forma de pagamento *</span>
              <select value={forma} onChange={(event) => setForma(event.target.value as FormaPagamento)}>
                {FORMA_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="vendedor-field-row">
              <label className="vendedor-field">
                <span>Data da venda</span>
                <input type="date" value={dataVenda} onChange={(event) => setDataVenda(event.target.value)} />
              </label>
              <label className="vendedor-field">
                <span>Data de entrega</span>
                <input type="date" value={dataEntrega} onChange={(event) => setDataEntrega(event.target.value)} />
              </label>
            </div>

            <label className="vendedor-field">
              <span>Canal do cliente</span>
              <select value={canal} onChange={(event) => setCanal(event.target.value)}>
                <option value="">— Nao informado —</option>
                {canais.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="vendedor-field-row">
              <label className="vendedor-field">
                <span>Valor total</span>
                <input inputMode="decimal" value={valorTotal} onChange={(event) => setValorTotal(event.target.value)} placeholder="50000,00" />
              </label>
              <label className="vendedor-field">
                <span>Valor de entrada</span>
                <input inputMode="decimal" value={valorEntrada} onChange={(event) => setValorEntrada(event.target.value)} placeholder="Opcional" />
              </label>
            </div>

            <label className="vendedor-field">
              <span>Comprador</span>
              <input value={compradorNome} onChange={(event) => setCompradorNome(event.target.value)} placeholder="Nome do comprador" />
            </label>
            <label className="vendedor-field">
              <span>Documento do comprador</span>
              <input value={compradorDoc} onChange={(event) => setCompradorDoc(event.target.value)} placeholder="CPF/CNPJ" />
            </label>
            <label className="vendedor-field">
              <span>Observacao</span>
              <textarea value={observacao} rows={2} onChange={(event) => setObservacao(event.target.value)} />
            </label>

            {error ? <p className="vendedor-error" data-testid="vendedor-sale-error">{error}</p> : null}
          </div>

          <footer className="vendedor-modal-foot">
            <button type="submit" className="vendedor-btn-primary" disabled={submitting} data-testid="vendedor-sale-submit">
              {submitting ? "Registrando..." : "Registrar venda"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  );
}
