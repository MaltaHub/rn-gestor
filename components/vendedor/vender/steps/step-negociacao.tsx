"use client";

import type { RequestAuth } from "@/components/ui-grid/types";
import type { LookupItem } from "@/lib/core/types/lookups";
import { Icon } from "@/components/vendedor/ui/icons";
import { formatValor } from "@/components/vendedor/format";
import type { EntradaTipo, FormaPagamento } from "@/lib/domain/vendas/schemas";
import type { VendaResumo } from "@/lib/domain/vendas/calculo";
import type { EntradaDraft, TrocaDraft, VendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { EntradaTrocaForm } from "@/components/vendedor/vender/steps/entrada-troca-form";
import { Campo, type FieldErrorState } from "@/components/vendedor/vender/field-error";
import styles from "@/components/vendedor/vender/vender.module.css";

const ENTRADA_LABEL: Record<EntradaTipo, string> = {
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  carro_troca: "Veículo na troca",
  outro: "Outro (dinheiro, TED...)"
};

const FORMAS: Array<{ value: FormaPagamento; label: string; hint: string }> = [
  { value: "a_vista_pix", label: "À vista (PIX)", hint: "O saldo é pago integralmente no PIX." },
  { value: "financiamento", label: "Financiamento", hint: "Banco, valor financiado e parcelas." },
  { value: "cartao_credito", label: "Cartão de crédito", hint: "Saldo parcelado no cartão." },
  { value: "consorcio", label: "Consórcio", hint: "Carta de consórcio (administradora)." }
];

/**
 * Etapa 2: valor, desconto, entradas (várias: PIX + troca + cartão...) e como o
 * saldo é pago. A frase de pagamento dos documentos sai destes dados.
 */
export function StepNegociacao({
  auth,
  locais,
  draft,
  patch,
  resumo,
  financValorEfetivo,
  fieldError,
  addEntrada,
  removeEntrada,
  patchEntrada,
  patchEntradaTroca
}: {
  auth: RequestAuth;
  locais: LookupItem[];
  draft: VendaDraft;
  patch: (changes: Partial<VendaDraft>) => void;
  resumo: VendaResumo;
  financValorEfetivo: number | null;
  fieldError: FieldErrorState;
  addEntrada: (tipo?: EntradaTipo) => void;
  removeEntrada: (key: string) => void;
  patchEntrada: (key: string, changes: Partial<Omit<EntradaDraft, "key" | "troca">>) => void;
  patchEntradaTroca: (key: string, changes: Partial<TrocaDraft>) => void;
}) {
  const forma = draft.formaPagamento;
  const saldo = resumo.valorFinanciado;

  return (
    <>
      <section className={styles.card} aria-label="Valor">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Valor</h3>
          <span className={styles.cardSub}>Sugerido pelo preço do anúncio.</span>
        </div>
        <div className={styles.fields}>
          <Campo label="Valor da venda (R$)" required span={3} field="valorTotal" fieldError={fieldError}>
            <input
              className={styles.input}
              inputMode="decimal"
              value={draft.valorTotal}
              onChange={(e) => patch({ valorTotal: e.target.value })}
              placeholder="65000,00"
              data-testid="vender-valor-total"
              aria-invalid={fieldError?.field === "valorTotal"}
            />
          </Campo>
          <Campo label="Desconto (R$)" span={3} field="desconto" fieldError={fieldError}>
            <input
              className={styles.input}
              inputMode="decimal"
              value={draft.desconto}
              onChange={(e) => patch({ desconto: e.target.value })}
              placeholder="Opcional"
              data-testid="vender-desconto"
            />
          </Campo>
        </div>
      </section>

      <section className={styles.card} aria-label="Entradas">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Entrada</h3>
          <span className={styles.cardSub}>
            {draft.entradas.length === 0 ? "Sem entrada — o valor inteiro vai na forma de pagamento." : `Total: ${formatValor(resumo.totalEntradas) ?? "R$ 0,00"}`}
          </span>
        </div>

        {draft.entradas.map((entrada, index) => (
          <div key={entrada.key} className={styles.entrada} data-testid={`vender-entrada-${index}`}>
            <div className={styles.entradaHead}>
              <span className={styles.entradaTitle}>
                {index + 1}. {ENTRADA_LABEL[entrada.tipo]}
              </span>
              <span className={styles.spacer} />
              <button
                type="button"
                className={`${styles.btn} ${styles.small}`}
                onClick={() => removeEntrada(entrada.key)}
                aria-label={`Remover a entrada ${index + 1}`}
                data-testid={`vender-entrada-remover-${index}`}
              >
                <Icon name="trash" size={14} />
                Remover
              </button>
            </div>
            <div className={styles.fields}>
              <Campo label="Valor (R$)" required span={entrada.tipo === "cartao_credito" ? 2 : 3} field={`entrada-${index}-valor`} fieldError={fieldError}>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={entrada.valor}
                  onChange={(e) => patchEntrada(entrada.key, { valor: e.target.value })}
                  placeholder="5000,00"
                  data-testid={`vender-entrada-valor-${index}`}
                  aria-invalid={fieldError?.field === `entrada-${index}-valor`}
                />
              </Campo>
              {entrada.tipo === "cartao_credito" ? (
                <>
                  <Campo label="Parcelas" required span={2} field={`entrada-${index}-cartaoParcelas`} fieldError={fieldError}>
                    <input
                      className={styles.input}
                      inputMode="numeric"
                      value={entrada.cartaoParcelasQtde}
                      onChange={(e) => patchEntrada(entrada.key, { cartaoParcelasQtde: e.target.value })}
                      placeholder="10"
                    />
                  </Campo>
                  <Campo label="Valor da parcela (R$)" span={2}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={entrada.cartaoParcelaValor}
                      onChange={(e) => patchEntrada(entrada.key, { cartaoParcelaValor: e.target.value })}
                      placeholder="500,00"
                    />
                  </Campo>
                </>
              ) : null}
              {entrada.tipo === "outro" ? (
                <Campo label="Como foi pago" span={3} hint='Sai no documento: "R$ 5.000,00 em dinheiro".'>
                  <input
                    className={styles.input}
                    value={entrada.descricao}
                    onChange={(e) => patchEntrada(entrada.key, { descricao: e.target.value })}
                    placeholder="dinheiro"
                  />
                </Campo>
              ) : null}
            </div>
            {entrada.tipo === "carro_troca" ? (
              entrada.carroTrocaId ? (
                <p className={styles.alert}>
                  <Icon name="car" size={16} />
                  Veículo da troca já cadastrado na loja{entrada.trocaRotulo ? `: ${entrada.trocaRotulo}` : ""}. Para mudar os dados dele, use o grid de
                  CARROS.
                </p>
              ) : (
                <EntradaTrocaForm
                  auth={auth}
                  index={index}
                  troca={entrada.troca}
                  locais={locais}
                  fieldError={fieldError}
                  onChange={(changes) => patchEntradaTroca(entrada.key, changes)}
                />
              )
            ) : null}
            {entrada.tipo === "carro_troca" ? (
              <div className={styles.fields}>
                <Campo label="Débitos do veículo da troca" span={4} hint="IPVA, multas, licenciamento, quitação... Só registro: não abate do valor da troca.">
                  <input
                    className={styles.input}
                    value={entrada.debitos}
                    onChange={(e) => patchEntrada(entrada.key, { debitos: e.target.value })}
                    placeholder="Ex.: IPVA 2026 e 2 multas em aberto"
                    data-testid={`vender-troca-debitos-${index}`}
                  />
                </Campo>
                <Campo label="Total dos débitos (R$)" span={2} field={`entrada-${index}-trocaDebitosValor`} fieldError={fieldError}>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={entrada.debitosValor}
                    onChange={(e) => patchEntrada(entrada.key, { debitosValor: e.target.value })}
                    placeholder="0,00"
                    data-testid={`vender-troca-debitos-valor-${index}`}
                  />
                </Campo>
              </div>
            ) : null}
          </div>
        ))}

        <div className={styles.addRow}>
          {(Object.keys(ENTRADA_LABEL) as EntradaTipo[]).map((tipo) => (
            <button key={tipo} type="button" className={`${styles.btn} ${styles.small}`} onClick={() => addEntrada(tipo)} data-testid={`vender-entrada-add-${tipo}`}>
              <Icon name="plus" size={14} />
              {ENTRADA_LABEL[tipo]}
            </button>
          ))}
        </div>
        {resumo.entradasExcedemTotal ? (
          <p className={`${styles.alert} ${styles.alertDanger}`} data-testid="vender-entradas-excedem">
            <Icon name="alert" size={16} />
            Entradas + desconto passam do valor da venda. Revise os valores.
          </p>
        ) : null}
      </section>

      <section className={styles.card} aria-label="Forma de pagamento do saldo">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>{draft.entradas.length > 0 ? "Pagamento do saldo" : "Forma de pagamento"}</h3>
          {saldo != null ? <span className={styles.cardSub}>{draft.entradas.length > 0 ? "Saldo" : "Valor"}: {formatValor(saldo)}</span> : null}
        </div>
        <div className={styles.options} role="radiogroup" aria-label="Forma de pagamento" data-testid="vender-forma-pagamento">
          {FORMAS.map((item) => (
            <label key={item.value} className={styles.option}>
              <input type="radio" name="forma_pagamento" value={item.value} checked={forma === item.value} onChange={() => patch({ formaPagamento: item.value })} />
              <span className={styles.optionTitle}>{item.label}</span>
              <span className={styles.optionHint}>{item.hint}</span>
            </label>
          ))}
        </div>

        {forma === "financiamento" || forma === "consorcio" ? (
          <div className={styles.fields} data-testid={`vender-campos-${forma}`}>
            <Campo label={forma === "financiamento" ? "Banco" : "Administradora"} span={forma === "financiamento" ? 2 : 6}>
              <input
                className={styles.input}
                value={draft.financBanco}
                onChange={(e) => patch({ financBanco: e.target.value })}
                placeholder={forma === "financiamento" ? "Santander, BV, Itaú..." : "Administradora do consórcio"}
              />
            </Campo>
            {forma === "financiamento" ? (
              <Campo
                label="Valor financiado (R$)"
                span={4}
                field="financValor"
                fieldError={fieldError}
                hint={`Em branco usa o saldo calculado${financValorEfetivo != null ? `: ${formatValor(financValorEfetivo)}` : ""}.`}
              >
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={draft.financValor}
                  onChange={(e) => patch({ financValor: e.target.value })}
                  placeholder={formatValor(saldo) ?? "Calculado"}
                />
              </Campo>
            ) : null}
            <Campo label="Parcelas" required span={3} field="financParcelasQtde" fieldError={fieldError}>
              <input
                className={styles.input}
                inputMode="numeric"
                value={draft.financParcelasQtde}
                onChange={(e) => patch({ financParcelasQtde: e.target.value })}
                placeholder="48"
                data-testid="vender-financ-parcelas"
              />
            </Campo>
            <Campo label="Valor da parcela (R$)" required span={3} field="financParcelaValor" fieldError={fieldError}>
              <input
                className={styles.input}
                inputMode="decimal"
                value={draft.financParcelaValor}
                onChange={(e) => patch({ financParcelaValor: e.target.value })}
                placeholder="1250,00"
                data-testid="vender-financ-parcela-valor"
              />
            </Campo>
          </div>
        ) : null}

        {forma === "cartao_credito" ? (
          <div className={styles.fields} data-testid="vender-campos-cartao">
            <Campo label="Parcelas no cartão" required span={3} field="cartaoParcelasQtde" fieldError={fieldError}>
              <input className={styles.input} inputMode="numeric" value={draft.cartaoParcelasQtde} onChange={(e) => patch({ cartaoParcelasQtde: e.target.value })} placeholder="12" />
            </Campo>
            <Campo label="Valor da parcela (R$)" required span={3} field="cartaoParcelaValor" fieldError={fieldError}>
              <input className={styles.input} inputMode="decimal" value={draft.cartaoParcelaValor} onChange={(e) => patch({ cartaoParcelaValor: e.target.value })} placeholder="4000,00" />
            </Campo>
          </div>
        ) : null}
      </section>
    </>
  );
}
