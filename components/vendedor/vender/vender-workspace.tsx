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
import { carroDisplayName, parseDecimal, parseInteiro } from "@/components/vendedor/format";
import type { LookupItem } from "@/lib/core/types/lookups";
import { createVendaV2, fetchVendaConcluidaByCarro, updateVendaV2 } from "@/components/vendedor/vender/api";
import { draftFromVenda, useVendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { StepCliente } from "@/components/vendedor/vender/steps/step-cliente";
import { StepPagamento } from "@/components/vendedor/vender/steps/step-pagamento";
import { StepEntradas } from "@/components/vendedor/vender/steps/step-entradas";
import { StepTransferencia } from "@/components/vendedor/vender/steps/step-transferencia";
import { StepResumo } from "@/components/vendedor/vender/steps/step-resumo";
import { VendidosBrowser } from "@/components/vendedor/vender/steps/vendidos-browser";

// O veículo é escolhido fora do wizard (botão "Vender" do veículo → ?carro=)
// ou pela aba Vendidos (modo edição); o wizard começa no Cliente. Entradas vêm
// antes do Pagamento: o valor financiado depende do total das entradas.
const STEPS = [
  { key: "cliente", label: "Cliente" },
  { key: "entradas", label: "Entradas" },
  { key: "pagamento", label: "Pagamento" },
  { key: "transferencia", label: "Transferência" },
  { key: "resumo", label: "Resumo" }
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/**
 * Vendas 2.0 — gerenciador de venda em /vendedor/vender. Wizard com cliente,
 * entradas múltiplas (incl. carro na troca), pagamento condicional,
 * transferência e resumo com a mensagem final. Também atualiza vendas
 * existentes (seção "Vendidos" do seletor → modo edição com PATCH).
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
    replaceDraft,
    addEntrada,
    removeEntrada,
    patchEntrada,
    patchEntradaTroca,
    resumo,
    financValorEfetivo,
    buildPayload
  } = useVendaDraft(actor?.authUserId ?? "");

  const [step, setStep] = useState(0);
  // Sem ?carro=, /vender abre na aba "Vendidos" (vendas em processo); o wizard
  // só entra ao iniciar uma venda (botão "Vender" do veículo) ou ao editar.
  const [view, setView] = useState<"wizard" | "vendidos">(carroIdFromQuery ? "wizard" : "vendidos");
  const [vendidosCount, setVendidosCount] = useState<number | null>(null);
  const [usuarios, setUsuarios] = useState<LookupItem[]>([]);
  const [canais, setCanais] = useState<LookupItem[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [loadingCarro, setLoadingCarro] = useState(Boolean(carroIdFromQuery));
  const [submitting, setSubmitting] = useState(false);
  const [vendaId, setVendaId] = useState<string | null>(null);
  const [vendaFechada, setVendaFechada] = useState<{ vendaId: string; carroId: string; editada: boolean } | null>(null);

  const editing = vendaId != null;
  const onVendidosCount = useCallback((total: number) => setVendidosCount(total), []);

  // Preço do veículo -> texto do input ("65000,00"), para pré-preencher a venda.
  const precoToInput = (carro: VendedorCarroDetail | null): string => {
    const p = typeof carro?.preco_original === "number" ? carro.preco_original : null;
    return p != null && Number.isFinite(p) ? p.toFixed(2).replace(".", ",") : "";
  };

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
        // Venda nova: já entra no wizard com o preço do veículo pré-preenchido.
        patch({ carro, valorTotal: precoToInput(carro) });
        setView("wizard");
        setStep(0);
      })
      .catch(() => {
        if (active) setStepError("Não foi possível carregar o veículo do link.");
      })
      .finally(() => {
        if (active) setLoadingCarro(false);
      });
    return () => {
      active = false;
    };
    // patch é estável (useCallback); roda só quando o id da query muda.
  }, [auth, carroIdFromQuery, patch]);

  // Aba "Vendidos": carrega o carro + a venda concluída e entra em modo edição.
  const selectVendido = useCallback(
    async (carroId: string) => {
      setLoadingCarro(true);
      setStepError(null);
      try {
        const [carro, venda] = await Promise.all([
          fetchCarroById({ requestAuth: auth, carroId }),
          fetchVendaConcluidaByCarro(auth, carroId)
        ]);
        if (!venda) {
          setStepError("Este veículo está VENDIDO mas não tem venda concluída registrada. Atualize pelo grid VENDAS.");
          return;
        }
        replaceDraft(draftFromVenda(carro, venda));
        setVendaId(venda.id);
        setView("wizard");
        setStep(0);
      } catch (err) {
        setStepError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao carregar a venda.");
      } finally {
        setLoadingCarro(false);
      }
    },
    [auth, replaceDraft]
  );

  const validateStep = useCallback(
    (key: StepKey): string | null => {
      if (key === "cliente") {
        if (!draft.carro) return "Selecione o veículo (inicie a venda a partir de um veículo).";
        if (!draft.compradorNome.trim()) return "Informe o nome do cliente.";
        if (!draft.vendedorAuthUserId.trim()) return "Selecione o vendedor responsável.";
        return null;
      }
      if (key === "entradas") {
        for (const [index, entrada] of draft.entradas.entries()) {
          const valor = parseDecimal(entrada.valor);
          if (valor == null || Number.isNaN(valor) || valor <= 0) return `Entrada ${index + 1}: informe um valor válido.`;
          if (entrada.tipo === "cartao_credito" && !entrada.cartaoParcelasQtde.trim()) {
            return `Entrada ${index + 1}: informe as parcelas do cartão.`;
          }
          if (entrada.tipo === "carro_troca" && !entrada.carroTrocaId && entrada.troca.placa.trim().length < 7) {
            return `Entrada ${index + 1}: informe a placa do carro da troca.`;
          }
        }
        return null;
      }
      if (key === "pagamento") {
        const valorTotal = parseDecimal(draft.valorTotal);
        if (valorTotal == null) return "Informe o valor da venda.";
        if (Number.isNaN(valorTotal) || valorTotal <= 0) return "Valor da venda inválido (ex.: 50000,00).";

        // Bloqueia o avanço até a forma de pagamento estar completa:
        // financiamento/consórcio exigem qtd. de parcelas + valor da parcela
        // (e o valor financiado, digitado ou calculado); cartão exige parcelas.
        const exigeParcelas = (qtdeRaw: string, valorRaw: string, rotulo: string): string | null => {
          const qtde = parseInteiro(qtdeRaw);
          if (qtde == null || Number.isNaN(qtde) || qtde <= 0) {
            return `Informe a quantidade de parcelas ${rotulo}.`;
          }
          const parcela = parseDecimal(valorRaw);
          if (parcela == null || Number.isNaN(parcela) || parcela <= 0) {
            return `Informe o valor da parcela ${rotulo}.`;
          }
          return null;
        };

        if (draft.formaPagamento === "financiamento") {
          const digitado = parseDecimal(draft.financValor);
          if (digitado != null && Number.isNaN(digitado)) return "Valor financiado inválido.";
          if (financValorEfetivo == null || financValorEfetivo <= 0) {
            return "Defina o valor do financiamento (digite ou ajuste venda/entradas para calcular).";
          }
          return exigeParcelas(draft.financParcelasQtde, draft.financParcelaValor, "do financiamento");
        }
        if (draft.formaPagamento === "consorcio") {
          return exigeParcelas(draft.financParcelasQtde, draft.financParcelaValor, "do consórcio");
        }
        if (draft.formaPagamento === "cartao_credito") {
          return exigeParcelas(draft.cartaoParcelasQtde, draft.cartaoParcelaValor, "do cartão");
        }
        return null;
      }
      return null;
    },
    [draft, financValorEfetivo]
  );

  function goToStep(target: number) {
    if (target <= step) {
      setStepError(null);
      setStep(target);
      return;
    }
    for (let index = step; index < target; index += 1) {
      const error = validateStep(STEPS[index].key);
      if (error) {
        setStepError(error);
        return;
      }
    }
    setStepError(null);
    setStep(target);
  }

  function goNext() {
    goToStep(step + 1);
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
      const venda = vendaId
        ? await updateVendaV2(auth, vendaId, result.payload)
        : await createVendaV2(auth, result.payload);
      setVendaFechada({ vendaId: venda.id, carroId: venda.carro_id, editada: Boolean(vendaId) });
    } catch (err) {
      setStepError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao registrar a venda.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepKey = STEPS[step].key;

  if (vendaFechada) {
    return (
      <section className="vender-workspace" data-testid="vender-sucesso">
        <div className="vender-sucesso">
          <h1>{vendaFechada.editada ? "Venda atualizada ✅" : "Venda registrada ✅"}</h1>
          <p className="vendedor-ok">
            {draft.carro ? `${carroDisplayName(draft.carro)}.` : ""}{" "}
            {vendaFechada.editada
              ? "Os dados da venda e as entradas foram atualizados."
              : "O envelope de documentos entrou em FECHANDO."}
          </p>
          <div className="vender-sucesso-actions">
            <button
              type="button"
              className="vendedor-btn-primary"
              onClick={() => router.push(`/vendedor/word?venda=${vendaFechada.vendaId}`)}
              data-testid="vender-ir-word"
            >
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
        <h1>{editing ? "Atualizar venda" : "Vender"}</h1>
        {draft.carro ? <p className="vender-head-carro">{carroDisplayName(draft.carro)} · {String(draft.carro.placa)}</p> : null}
      </header>

      <nav className="vender-stepper" aria-label="Etapas da venda">
        {/* Aba "Vendidos" (fichas fechadas) antes de tudo, com o contador. */}
        <button
          type="button"
          className={`vender-step-pill is-vendidos ${view === "vendidos" ? "is-active" : ""}`.trim()}
          onClick={() => {
            setStepError(null);
            setView("vendidos");
          }}
          aria-current={view === "vendidos" ? "step" : undefined}
          data-testid="vender-tab-vendidos"
        >
          <span className="vender-step-num">{vendidosCount ?? "•"}</span>
          Vendidos
        </button>
        {STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={`vender-step-pill ${view === "wizard" && index === step ? "is-active" : ""} ${
              view === "wizard" && index < step ? "is-done" : ""
            }`.trim()}
            onClick={() => {
              setView("wizard");
              goToStep(index);
            }}
            aria-current={view === "wizard" && index === step ? "step" : undefined}
            data-testid={`vender-step-${item.key}`}
          >
            <span className="vender-step-num">{index + 1}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {loadingCarro ? <p className="vendedor-hint">Carregando veículo...</p> : null}
      {stepError ? <p className="vendedor-error" data-testid="vender-step-error">{stepError}</p> : null}

      {view === "vendidos" ? (
        <VendidosBrowser onSelect={(carroId) => void selectVendido(carroId)} onCount={onVendidosCount} />
      ) : null}

      {view === "wizard" && !draft.carro && !loadingCarro ? (
        <div className="vender-step vender-sem-veiculo" data-testid="vender-sem-veiculo">
          <p>Para iniciar uma venda, abra um veículo disponível e toque em <strong>Vender</strong>.</p>
          <div className="vender-sucesso-actions">
            <button type="button" className="vendedor-btn-primary" onClick={() => router.push("/vendedor")}>
              Escolher veículo
            </button>
            <button type="button" className="vendedor-btn-ghost" onClick={() => setView("vendidos")}>
              Ver vendas em processo
            </button>
          </div>
        </div>
      ) : null}

      {view === "wizard" && draft.carro && stepKey === "cliente" ? (
        <StepCliente draft={draft} patch={patch} usuarios={usuarios} canais={canais} actorNome={actor?.userName ?? null} />
      ) : null}
      {view === "wizard" && stepKey === "entradas" ? (
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
      {view === "wizard" && stepKey === "pagamento" ? (
        <StepPagamento draft={draft} patch={patch} resumo={resumo} financValorEfetivo={financValorEfetivo} />
      ) : null}
      {view === "wizard" && stepKey === "transferencia" ? <StepTransferencia draft={draft} patch={patch} /> : null}
      {view === "wizard" && stepKey === "resumo" ? (
        <StepResumo draft={draft} resumo={resumo} financValorEfetivo={financValorEfetivo} />
      ) : null}

      {view === "wizard" && draft.carro ? (
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
            {submitting ? "Salvando..." : editing ? "Salvar alterações" : "Fechar a ficha"}
          </button>
        )}
      </footer>
      ) : null}
    </section>
  );
}
