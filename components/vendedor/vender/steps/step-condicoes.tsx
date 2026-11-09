"use client";

import { Icon } from "@/components/vendedor/ui/icons";
import type { TipoTransferencia } from "@/lib/domain/vendas/schemas";
import { anoDaData } from "@/lib/domain/vendas/situacao";
import type { CarroPainel } from "@/lib/domain/vendedor/types";
import { VALOR_TRANSFERENCIA_LOJA_DEFAULT, type VendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { Campo, type FieldErrorState } from "@/components/vendedor/vender/field-error";
import styles from "@/components/vendedor/vender/vender.module.css";

const TRANSFERENCIAS: Array<{ value: TipoTransferencia; label: string; hint: string }> = [
  { value: "loja", label: "Pela loja", hint: "A loja transfere e cobra a taxa (padrão R$ 990,00)." },
  { value: "financiamento", label: "Pelo financiamento", hint: "A financiadora cuida da transferência." },
  { value: "cliente", label: "Pelo comprador", hint: "O comprador transfere em até 30 dias (CTB, art. 123)." }
];

/** Acrescenta uma frase aos débitos sem repetir a que já está lá. */
function acrescentar(debitos: string, frase: string): string {
  const atual = debitos.trim();
  if (atual.toLowerCase().includes(frase.toLowerCase())) return atual;
  return atual ? `${atual.replace(/[.;]\s*$/, "")}; ${frase}` : frase;
}

/**
 * Etapa 3: o que acompanha a venda — data, transferência, IPVA e débitos.
 * O IPVA parte do VERÍDICO (o cadastro do veículo); se o vendedor sabe que
 * está pago, confirma e o cadastro é atualizado ao salvar. Pendências vão em
 * "Débitos do veículo", que sai no documento como está escrito.
 */
export function StepCondicoes({
  draft,
  patch,
  carro,
  fieldError
}: {
  draft: VendaDraft;
  patch: (changes: Partial<VendaDraft>) => void;
  carro: CarroPainel;
  fieldError: FieldErrorState;
}) {
  const ano = anoDaData(draft.dataVenda) ?? new Date().getFullYear();
  const pagoNoCadastro = carro.anoIpvaPago != null && carro.anoIpvaPago >= ano;
  const ipvaPago = pagoNoCadastro || draft.confirmarIpva;

  function selectTransferencia(tipo: TipoTransferencia) {
    if (tipo === "loja") {
      patch({ tipoTransferencia: tipo, valorTransferencia: draft.valorTransferencia.trim() || VALOR_TRANSFERENCIA_LOJA_DEFAULT });
      return;
    }
    const padrao = draft.valorTransferencia.trim() === VALOR_TRANSFERENCIA_LOJA_DEFAULT;
    patch({ tipoTransferencia: tipo, valorTransferencia: padrao ? "" : draft.valorTransferencia });
  }

  const sugestoes = ipvaPago
    ? [`Multas em aberto`, `Licenciamento ${ano} em aberto`]
    : [`IPVA ${ano} em aberto, por conta do comprador`, `IPVA ${ano} em aberto, a ser quitado pela loja`, `Multas em aberto`];

  return (
    <>
      <section className={styles.card} aria-label="Data e transferência">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Transferência</h3>
          <span className={styles.cardSub}>Quem passa o veículo para o nome do comprador.</span>
        </div>
        <div className={styles.options} role="radiogroup" aria-label="Transferência" data-testid="vender-transferencia">
          {TRANSFERENCIAS.map((item) => (
            <label key={item.value} className={styles.option}>
              <input
                type="radio"
                name="tipo_transferencia"
                value={item.value}
                checked={draft.tipoTransferencia === item.value}
                onChange={() => selectTransferencia(item.value)}
              />
              <span className={styles.optionTitle}>{item.label}</span>
              <span className={styles.optionHint}>{item.hint}</span>
            </label>
          ))}
        </div>
        <div className={styles.fields}>
          <Campo label="Valor da transferência (R$)" span={3} field="valorTransferencia" fieldError={fieldError}>
            <input
              className={styles.input}
              inputMode="decimal"
              value={draft.valorTransferencia}
              onChange={(e) => patch({ valorTransferencia: e.target.value })}
              placeholder={draft.tipoTransferencia === "loja" ? VALOR_TRANSFERENCIA_LOJA_DEFAULT : "Opcional"}
              data-testid="vender-transferencia-valor"
            />
          </Campo>
          <Campo label="Data da venda" span={3} field="dataVenda" fieldError={fieldError}>
            <input className={styles.input} type="date" value={draft.dataVenda} onChange={(e) => patch({ dataVenda: e.target.value })} />
          </Campo>
        </div>
      </section>

      <section className={styles.card} aria-label="IPVA e débitos" data-testid="vender-ipva">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>IPVA {ano} e débitos</h3>
          <span className={styles.cardSub}>O documento sai com o que é verdade no cadastro.</span>
        </div>

        {pagoNoCadastro ? (
          <p className={`${styles.alert} ${styles.alertOk}`} data-testid="vender-ipva-cadastro">
            <Icon name="check" size={16} />
            IPVA {ano} pago, conforme o cadastro do veículo. O documento traz &quot;IPVA {ano} PAGO&quot;.
          </p>
        ) : (
          <>
            <p className={styles.alert} data-testid="vender-ipva-cadastro">
              <Icon name="info" size={16} />
              O cadastro do veículo não registra o IPVA {ano} como pago{carro.anoIpvaPago ? ` (último pago: ${carro.anoIpvaPago})` : ""}.
            </p>
            <div className={styles.options} role="radiogroup" aria-label={`Situação do IPVA ${ano}`}>
              <label className={styles.option}>
                <input type="radio" name="ipva" checked={draft.confirmarIpva} onChange={() => patch({ confirmarIpva: true })} data-testid="vender-ipva-pago" />
                <span className={styles.optionTitle}>Está pago</span>
                <span className={styles.optionHint}>Registra no cadastro do veículo ao salvar; o documento traz &quot;IPVA {ano} PAGO&quot;.</span>
              </label>
              <label className={styles.option}>
                <input type="radio" name="ipva" checked={!draft.confirmarIpva} onChange={() => patch({ confirmarIpva: false })} data-testid="vender-ipva-aberto" />
                <span className={styles.optionTitle}>Em aberto</span>
                <span className={styles.optionHint}>Diga abaixo, em Débitos, quem paga (comprador ou loja).</span>
              </label>
            </div>
          </>
        )}

        <div className={styles.fields}>
          <Campo label="Débitos do veículo" hint="Sai no documento exatamente como escrito. Deixe vazio se não houver.">
            <textarea
              className={styles.textarea}
              value={draft.debitos}
              rows={2}
              onChange={(e) => patch({ debitos: e.target.value })}
              placeholder={ipvaPago ? "Ex.: multa de 2025 em aberto" : `Ex.: IPVA ${ano} em aberto, por conta do comprador`}
              data-testid="vender-debitos"
            />
          </Campo>
        </div>
        <div className={styles.addRow}>
          {sugestoes.map((frase) => (
            <button key={frase} type="button" className={`${styles.btn} ${styles.small}`} onClick={() => patch({ debitos: acrescentar(draft.debitos, frase) })}>
              <Icon name="plus" size={14} />
              {frase}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.card} aria-label="Observação">
        <div className={styles.fields}>
          <Campo label="Observação da venda" hint="Combinações com o cliente, pendências internas. Sai só onde o template usar ${OBSERVAÇÃO}.">
            <textarea className={styles.textarea} value={draft.observacao} rows={3} onChange={(e) => patch({ observacao: e.target.value })} />
          </Campo>
        </div>
      </section>
    </>
  );
}
