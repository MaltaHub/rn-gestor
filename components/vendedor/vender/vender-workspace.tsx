"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ApiClientError,
  fetchCarroById,
  fetchLookups,
  type VendedorCarroDetail
} from "@/components/ui-grid/api";
import { useAuthSessionState } from "@/components/auth/auth-provider";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { carroDisplayName, parseDecimal } from "@/components/vendedor/format";
import type { LookupItem } from "@/lib/core/types/lookups";
import { createVendaV2 } from "@/components/vendedor/vender/api";
import { useVendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { StepVeiculo } from "@/components/vendedor/vender/steps/step-veiculo";
import { StepCliente } from "@/components/vendedor/vender/steps/step-cliente";
import { StepPagamento } from "@/components/vendedor/vender/steps/step-pagamento";
import { StepEntradas } from "@/components/vendedor/vender/steps/step-entradas";
import { StepTransferencia } from "@/components/vendedor/vender/steps/step-transferencia";
import { StepResumo } from "@/components/vendedor/vender/steps/step-resumo";

const STEPS = ["Veículo", "Cliente", "Pagamento", "Entradas", "Transferência", "Resumo"] as const;

/**
 * Vendas 2.0 — gerenciador de venda em /vendedor/vender. Substitui o dialog
 * básico: wizard com cliente, pagamento condicional, entradas múltiplas
 * (incl. carro na troca), transferência e resumo calculado com a mensagem
 * final da venda.
 */
export function VenderWorkspace() {
  const auth = useVendedorAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { actor } = useAuthSessionState();
  const carroIdFromQuery = searchParams.get("carro");

  const {
    draft,
    patch,
    addEntrada,
    removeEntrada,
    patchEntrada,
    patchEntradaTroca,
    resumo,
    financValorEfetivo,
    buildPayload
  } = useVendaDraft(actor?.authUserId ?? "");

  const [step, setStep] = useState(0);
  const [usuarios, setUsuarios] = useState<LookupItem[]>([]);
  const [canais, setCanais] = useState<LookupItem[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [loadingCarro, setLoadingCarro] = useState(Boolean(carroIdFromQuery));
  const [submitting, setSubmitting] = useState(false);
  const [vendaFechada, setVendaFechada] = useState<{ carroId: string } | null>(null);

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

  // ?carro=<id>: veículo já vem selecionado (fluxo botão "Vender" do detalhe).
  useEffect(() => {
    if (!carroIdFromQuery) return;
    let active = true;
    setLoadingCarro(true);
    fetchCarroById({ requestAuth: auth, carroId: carroIdFromQuery })
      .then((carro) => {
        if (!active) return;
        patch({ carro });
        setStep((current) => (current === 0 ? 1 : current));
      })
      .catch(() => {
        if (active) setStepError("Não foi possível carregar o veículo do link. Selecione manualmente.");
      })
      .finally(() => {
        if (active) setLoadingCarro(false);
      });
    return () => {
      active = false;
    };
    // patch é estável (useCallback); roda só quando o id da query muda.
  }, [auth, carroIdFromQuery, patch]);

  const validateStep = useCallback(
    (target: number): string | null => {
      if (target === 0) return draft.carro ? null : "Selecione o veículo que será vendido.";
      if (target === 1) {
        if (!draft.compradorNome.trim()) return "Informe o nome do cliente.";
        if (!draft.vendedorAuthUserId.trim()) return "Selecione o vendedor responsável.";
        return null;
      }
      if (target === 2) {
        const valorTotal = parseDecimal(draft.valorTotal);
        if (valorTotal == null) return "Informe o valor da venda.";
        if (Number.isNaN(valorTotal) || valorTotal <= 0) return "Valor da venda inválido (ex.: 50000,00).";
        return null;
      }
      if (target === 3) {
        for (const [index, entrada] of draft.entradas.entries()) {
          const valor = parseDecimal(entrada.valor);
          if (valor == null || Number.isNaN(valor) || valor <= 0) return `Entrada ${index + 1}: informe um valor válido.`;
          if (entrada.tipo === "cartao_credito" && !entrada.cartaoParcelasQtde.trim()) {
            return `Entrada ${index + 1}: informe as parcelas do cartão.`;
          }
          if (entrada.tipo === "carro_troca" && entrada.troca.placa.trim().length < 7) {
            return `Entrada ${index + 1}: informe a placa do carro da troca.`;
          }
        }
        return null;
      }
      return null;
    },
    [draft]
  );

  function goNext() {
    const error = validateStep(step);
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goBack() {
    setStepError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function fecharFicha() {
    if (submitting) return;
    const result = buildPayload();
    if ("error" in result) {
      setStepError(result.error);
      return;
    }
    setSubmitting(true);
    setStepError(null);
    try {
      const venda = await createVendaV2(auth, result.payload);
      setVendaFechada({ carroId: venda.carro_id });
    } catch (err) {
      setStepError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao registrar a venda.");
    } finally {
      setSubmitting(false);
    }
  }

  if (vendaFechada) {
    return (
      <section className="vender-workspace" data-testid="vender-sucesso">
        <div className="vender-sucesso">
          <h1>Venda registrada ✅</h1>
          <p className="vendedor-ok">
            {draft.carro ? `${carroDisplayName(draft.carro)} vendido.` : "Venda registrada."} O envelope de documentos
            entrou em FECHANDO.
          </p>
          <div className="vender-sucesso-actions">
            <button type="button" className="vendedor-btn-primary" onClick={() => router.push("/vendedor/word")} data-testid="vender-ir-word">
              Gerar documentos no Word
            </button>
            <button type="button" className="vendedor-btn-ghost" onClick={() => router.push(`/vendedor/veiculo/${vendaFechada.carroId}`)}>
              Ver veículo
            </button>
            <button type="button" className="vendedor-btn-ghost" onClick={() => router.push("/vendedor")}>
              Voltar ao início
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="vender-workspace" data-testid="vender-workspace">
      <header className="vender-head">
        <h1>Vender</h1>
        {draft.carro ? <p className="vender-head-carro">{carroDisplayName(draft.carro)} · {String(draft.carro.placa)}</p> : null}
      </header>

      <nav className="vender-stepper" aria-label="Etapas da venda">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`vender-step-pill ${index === step ? "is-active" : ""} ${index < step ? "is-done" : ""}`.trim()}
            onClick={() => {
              // Voltar é sempre permitido; avançar valida as etapas no caminho.
              if (index <= step) {
                setStepError(null);
                setStep(index);
                return;
              }
              for (let target = step; target < index; target += 1) {
                const error = validateStep(target);
                if (error) {
                  setStepError(error);
                  return;
                }
              }
              setStepError(null);
              setStep(index);
            }}
            aria-current={index === step ? "step" : undefined}
            data-testid={`vender-step-${index}`}
          >
            <span className="vender-step-num">{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      {loadingCarro ? <p className="vendedor-hint">Carregando veículo...</p> : null}
      {stepError ? <p className="vendedor-error" data-testid="vender-step-error">{stepError}</p> : null}

      {step === 0 ? (
        <StepVeiculo
          carro={draft.carro}
          onSelect={(carro: VendedorCarroDetail | null) => {
            patch({ carro });
            if (carro) {
              setStepError(null);
              setStep(1);
            }
          }}
        />
      ) : null}
      {step === 1 ? (
        <StepCliente draft={draft} patch={patch} usuarios={usuarios} canais={canais} actorNome={actor?.userName ?? null} />
      ) : null}
      {step === 2 ? <StepPagamento draft={draft} patch={patch} financValorCalculado={resumo.valorFinanciado} /> : null}
      {step === 3 ? (
        <StepEntradas
          draft={draft}
          totalEntradas={resumo.totalEntradas}
          onTemEntrada={(tem) => {
            if (tem) {
              if (draft.entradas.length === 0) addEntrada();
              else patch({ temEntrada: true });
            } else {
              patch({ temEntrada: false });
              for (const entrada of draft.entradas) removeEntrada(entrada.key);
            }
          }}
          addEntrada={addEntrada}
          removeEntrada={removeEntrada}
          patchEntrada={patchEntrada}
          patchEntradaTroca={patchEntradaTroca}
        />
      ) : null}
      {step === 4 ? <StepTransferencia draft={draft} patch={patch} /> : null}
      {step === 5 ? <StepResumo draft={draft} resumo={resumo} financValorEfetivo={financValorEfetivo} /> : null}

      <footer className="vender-foot">
        {step > 0 ? (
          <button type="button" className="vendedor-btn-ghost" onClick={goBack} disabled={submitting} data-testid="vender-voltar">
            ← Voltar
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="vendedor-btn-primary" onClick={goNext} data-testid="vender-avancar">
            Avançar →
          </button>
        ) : (
          <button
            type="button"
            className="vendedor-btn-primary"
            onClick={() => void fecharFicha()}
            disabled={submitting}
            data-testid="vender-fechar-ficha"
          >
            {submitting ? "Fechando..." : "Fechar a ficha"}
          </button>
        )}
      </footer>
    </section>
  );
}
