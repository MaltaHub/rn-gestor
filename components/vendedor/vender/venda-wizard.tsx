"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchLookups } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import { Icon } from "@/components/vendedor/ui/icons";
import { confirmarIpvaPago } from "@/components/vendedor/api";
import { createVenda, updateVenda } from "@/components/vendedor/vender/api";
import { scrollToFieldError, type FieldErrorState } from "@/components/vendedor/vender/field-error";
import {
  buildVendaPayload,
  contextoDoRascunho,
  descartarRascunho,
  ETAPAS,
  useVendaDraft,
  validarEtapa
} from "@/components/vendedor/vender/use-venda-draft";
import { StepComprador } from "@/components/vendedor/vender/steps/step-comprador";
import { StepNegociacao } from "@/components/vendedor/vender/steps/step-negociacao";
import { StepCondicoes } from "@/components/vendedor/vender/steps/step-condicoes";
import { ResumoValores, StepRevisao } from "@/components/vendedor/vender/steps/step-revisao";
import styles from "@/components/vendedor/vender/vender.module.css";
import type { LookupItem } from "@/lib/core/types/lookups";
import { anoDaData } from "@/lib/domain/vendas/situacao";
import type { PainelVeiculo } from "@/lib/domain/vendedor/types";

// Vendedores e canais mudam pouco: uma busca por aba.
type LookupsVenda = { usuarios: LookupItem[]; canais: LookupItem[]; locais: LookupItem[] };
let lookupsPromise: Promise<LookupsVenda> | null = null;
function carregarLookups(auth: RequestAuth) {
  if (!lookupsPromise) {
    lookupsPromise = fetchLookups(auth)
      .then((data) => ({ usuarios: data.usuarios, canais: data.canais_cliente, locais: data.locations }))
      .catch(() => {
        lookupsPromise = null;
        return { usuarios: [], canais: [], locais: [] };
      });
  }
  return lookupsPromise;
}

export type ModoSalvar = "reserva" | "concluir" | "salvar";

/**
 * Fluxo da venda de UM veículo: Comprador → Negociação → Condições → Revisão.
 * Salva como RESERVA (carro reservado, venda em negociação) ou CONCLUI (carro
 * vendido). Editando venda concluída, salva as alterações de qualquer etapa.
 */
export function VendaWizard({
  auth,
  painel,
  vendedorPadrao,
  vendedorNome,
  onCancelar,
  onSalvo
}: {
  auth: RequestAuth;
  painel: PainelVeiculo;
  vendedorPadrao: string;
  vendedorNome: string | null;
  onCancelar: () => void;
  onSalvo: (modo: ModoSalvar) => void;
}) {
  const { carro, venda } = painel;
  const { draft, patch, addEntrada, removeEntrada, patchEntrada, patchEntradaTroca, resumo, financValorEfetivo, recuperado, descartar } = useVendaDraft(
    carro,
    venda,
    vendedorPadrao
  );
  const [step, setStep] = useState(0);
  const [fieldError, setFieldError] = useState<FieldErrorState>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<ModoSalvar | null>(null);
  const [lookups, setLookups] = useState<LookupsVenda>({ usuarios: [], canais: [], locais: [] });

  useEffect(() => {
    let ativo = true;
    void carregarLookups(auth).then((data) => {
      if (ativo) setLookups(data);
    });
    return () => {
      ativo = false;
    };
  }, [auth]);

  const nomeVendedor = useMemo(
    () => lookups.usuarios.find((item) => item.code === draft.vendedorAuthUserId)?.name ?? vendedorNome,
    [draft.vendedorAuthUserId, lookups.usuarios, vendedorNome]
  );
  const contexto = useMemo(() => contextoDoRascunho(draft, carro, financValorEfetivo, nomeVendedor), [carro, draft, financValorEfetivo, nomeVendedor]);

  const estado = venda?.estado_venda ?? null;
  const concluida = estado === "concluida";
  const ultimo = step === ETAPAS.length - 1;

  function pendenciaAte(alvo: number) {
    for (let index = 0; index < alvo; index += 1) {
      const pendencia = validarEtapa(draft, ETAPAS[index].key, financValorEfetivo);
      if (pendencia) return { pendencia, index };
    }
    return null;
  }

  function mostrarPendencia(pendencia: { field: string; message: string }, index: number) {
    setStep(index);
    setFieldError(pendencia);
    setErro(null);
    scrollToFieldError(pendencia.field);
  }

  function irPara(alvo: number) {
    if (alvo <= step) {
      setFieldError(null);
      setStep(alvo);
      return;
    }
    const falha = pendenciaAte(alvo);
    if (falha) {
      mostrarPendencia(falha.pendencia, falha.index);
      return;
    }
    setFieldError(null);
    setStep(alvo);
  }

  async function salvar(modo: ModoSalvar) {
    if (salvando) return;
    const result = buildVendaPayload(draft, carro.id, financValorEfetivo);
    if ("error" in result) {
      const falha = pendenciaAte(ETAPAS.length);
      if (falha) mostrarPendencia(falha.pendencia, falha.index);
      else setErro(result.error.message);
      return;
    }
    setSalvando(modo);
    setErro(null);
    try {
      const { payload } = result;
      if (venda) {
        const transicao = modo === "concluir" && estado === "aberta" ? { estado_venda: "concluida" as const, estagio: "aberto" as const } : {};
        await updateVenda(auth, venda.id, { ...payload, ...transicao });
      } else {
        await createVenda(auth, { ...payload, estado_venda: modo === "reserva" ? "aberta" : "concluida" });
      }
      if (draft.confirmarIpva) {
        const ano = anoDaData(draft.dataVenda) ?? new Date().getFullYear();
        await confirmarIpvaPago(auth, carro.id, ano).catch(() => {
          // A venda já foi salva: o IPVA pode ser confirmado de novo depois.
        });
      }
      descartarRascunho(carro.id);
      onSalvo(modo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao salvar a venda.");
    } finally {
      setSalvando(null);
    }
  }

  const etapa = ETAPAS[step].key;

  return (
    <div className={styles.wizard} data-testid="vender-wizard">
      <div className={styles.wizardHead}>
        <h2 className={styles.wizardTitle}>{concluida ? "Editar venda" : estado === "aberta" ? "Continuar a venda" : "Nova venda"}</h2>
        {recuperado ? (
          <span className={styles.alert}>
            <Icon name="info" size={16} />
            Rascunho recuperado deste aparelho.
            <button type="button" className={styles.linkBtn} onClick={descartar}>
              Descartar
            </button>
          </span>
        ) : null}
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} onClick={onCancelar} disabled={Boolean(salvando)} data-testid="vender-wizard-cancelar">
          Fechar
        </button>
      </div>

      <ol className={styles.stepper} aria-label="Etapas da venda">
        {ETAPAS.map((item, index) => (
          <li key={item.key}>
            <button
              type="button"
              className={styles.stepBtn}
              aria-current={index === step ? "step" : undefined}
              data-feito={index < step ? "true" : undefined}
              onClick={() => irPara(index)}
              data-testid={`vender-etapa-${item.key}`}
            >
              <span className={styles.stepNum}>{index < step ? <Icon name="check" size={13} strokeWidth={2.4} /> : index + 1}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ol>

      {erro ? (
        <p className={`${styles.alert} ${styles.alertDanger}`} role="alert" data-testid="vender-erro">
          <Icon name="alert" size={16} />
          {erro}
        </p>
      ) : null}

      <div className={styles.wizardBody}>
        <div className={styles.wizardMain}>
          {etapa === "comprador" ? (
            <StepComprador
              draft={draft}
              patch={patch}
              usuarios={lookups.usuarios}
              canais={lookups.canais}
              actorNome={vendedorNome}
              fieldError={fieldError}
            />
          ) : null}
          {etapa === "negociacao" ? (
            <StepNegociacao
              auth={auth}
              locais={lookups.locais}
              draft={draft}
              patch={patch}
              resumo={resumo}
              financValorEfetivo={financValorEfetivo}
              fieldError={fieldError}
              addEntrada={addEntrada}
              removeEntrada={removeEntrada}
              patchEntrada={patchEntrada}
              patchEntradaTroca={patchEntradaTroca}
            />
          ) : null}
          {etapa === "condicoes" ? <StepCondicoes draft={draft} patch={patch} carro={carro} fieldError={fieldError} /> : null}
          {etapa === "revisao" ? <StepRevisao contexto={contexto} resumo={resumo} /> : null}
        </div>
        <aside className={styles.aside}>
          <ResumoValores draft={draft} resumo={resumo} financValorEfetivo={financValorEfetivo} />
        </aside>
      </div>

      <footer className={styles.footer}>
        {step > 0 ? (
          <button type="button" className={styles.btn} onClick={() => irPara(step - 1)} disabled={Boolean(salvando)} data-testid="vender-voltar">
            <Icon name="chevronLeft" size={16} />
            Voltar
          </button>
        ) : null}
        <span className={styles.spacer} />
        {concluida ? (
          <>
            {!ultimo ? (
              <button type="button" className={styles.btn} onClick={() => irPara(step + 1)} data-testid="vender-avancar">
                Avançar
                <Icon name="chevronRight" size={16} />
              </button>
            ) : null}
            <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => void salvar("salvar")} disabled={Boolean(salvando)} data-testid="vender-salvar">
              {salvando ? "Salvando..." : "Salvar alterações"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.btn} onClick={() => void salvar("reserva")} disabled={Boolean(salvando)} data-testid="vender-reservar">
              {salvando === "reserva" ? "Salvando..." : estado === "aberta" ? "Salvar reserva" : "Salvar como reserva"}
            </button>
            {ultimo ? (
              <button type="button" className={`${styles.btn} ${styles.success}`} onClick={() => void salvar("concluir")} disabled={Boolean(salvando)} data-testid="vender-concluir">
                <Icon name="check" size={16} />
                {salvando === "concluir" ? "Concluindo..." : "Concluir venda"}
              </button>
            ) : (
              <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => irPara(step + 1)} data-testid="vender-avancar">
                Avançar
                <Icon name="chevronRight" size={16} />
              </button>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
