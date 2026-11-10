"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthSessionState } from "@/components/auth/auth-provider";
import { fetchPainelVeiculo } from "@/components/vendedor/api";
import { useListaPreferencias } from "@/components/vendedor/lista-preferencias";
import { Icon } from "@/components/vendedor/ui/icons";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { useVeiculosVendedor } from "@/components/vendedor/use-veiculos";
import { AbrindoVeiculo, VeiculoFiltros, VeiculoLista } from "@/components/vendedor/veiculos/veiculos-ui";
import { PainelVenda } from "@/components/vendedor/vender/painel-venda";
import styles from "@/components/vendedor/vender/vender.module.css";
import type { PainelVeiculo, SituacaoFiltro, VeiculoVendedorItem } from "@/lib/domain/vendedor/types";

const FILTROS_VENDER: SituacaoFiltro[] = ["disponivel", "reservado", "vendido", "entregue"];

function syncUrl(carroId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete("iniciar");
  if (carroId) url.searchParams.set("carro", carroId);
  else url.searchParams.delete("carro");
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * /vendedor/vender: escolhe o veículo na lista (por situação) e vê, no painel,
 * a venda, os documentos Word e os arquivos — e inicia/continua a venda ali
 * mesmo. `?carro=<id>` seleciona; `&iniciar=1` já abre o fluxo (botão
 * "Vender" da ficha do veículo). Lista em ordem Recentes (o que o usuário
 * mexeu por último) ou A–Z; a busca digitada atravessa para o /word.
 */
export function VenderWorkspace() {
  const auth = useVendedorAuth();
  const { actor } = useAuthSessionState();
  const searchParams = useSearchParams();
  const podeGerenciar = actor?.role === "GERENTE" || actor?.role === "ADMINISTRADOR";

  const { q, setQ, ordem, setOrdem } = useListaPreferencias();
  const [situacao, setSituacao] = useState<SituacaoFiltro>("disponivel");
  const lista = useVeiculosVendedor(auth, { situacao, q, ordem });

  const [carroId, setCarroId] = useState<string | null>(searchParams.get("carro"));
  const [abrindo, setAbrindo] = useState<VeiculoVendedorItem | null>(null);
  const [wizard, setWizard] = useState(searchParams.get("iniciar") === "1");
  const [painel, setPainel] = useState<PainelVeiculo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(
    async (id: string, signal?: AbortSignal) => {
      setError(null);
      try {
        const data = await fetchPainelVeiculo(auth, id, signal);
        if (!signal?.aborted) setPainel(data);
      } catch (err) {
        if (signal?.aborted) return;
        setPainel(null);
        setError(err instanceof Error ? err.message : "Falha ao carregar o veículo.");
      }
    },
    [auth]
  );

  useEffect(() => {
    syncUrl(carroId);
    if (!carroId) {
      setPainel(null);
      return;
    }
    const controller = new AbortController();
    void carregar(carroId, controller.signal);
    return () => controller.abort();
  }, [carregar, carroId]);

  function selecionar(item: VeiculoVendedorItem) {
    if (item.carroId === carroId) return;
    setWizard(false);
    setPainel(null);
    setError(null);
    setAbrindo(item);
    setCarroId(item.carroId);
  }

  const recarregarLista = lista.reload;
  const atualizar = useCallback(() => {
    if (carroId) void carregar(carroId);
    recarregarLista();
  }, [carregar, carroId, recarregarLista]);

  const painelDoCarro = painel && painel.carro.id === carroId ? painel : null;

  return (
    <section className={styles.workspace} data-selecionado={carroId ? "true" : undefined} data-testid="vender-workspace">
      <aside className={styles.nav} aria-label="Veículos">
        <div className={styles.navHead}>
          <h1 className={styles.navTitle}>Vender</h1>
          <VeiculoFiltros
            q={q}
            onQ={setQ}
            situacao={situacao}
            onSituacao={setSituacao}
            contagens={lista.contagens}
            opcoes={FILTROS_VENDER}
            buscando={lista.buscando}
            ordem={ordem}
            onOrdem={setOrdem}
            total={lista.loading && lista.itens.length === 0 ? null : lista.total}
            testIdPrefix="vender-veiculos"
          />
        </div>
        <div className={styles.navScroll}>
          <VeiculoLista
            itens={lista.itens}
            selecionadoId={carroId}
            carregandoId={carroId && !painelDoCarro && !error ? carroId : null}
            onSelecionar={selecionar}
            loading={lista.loading}
            error={lista.error}
            hasMore={lista.hasMore}
            onLoadMore={lista.loadMore}
            vazio={lista.buscando ? "Nenhum veículo encontrado." : "Nenhum veículo nesta situação."}
            testIdPrefix="vender-veiculo"
          />
        </div>
      </aside>

      <div className={styles.stage}>
        {!carroId ? (
          <div className={styles.empty}>
            <Icon name="sale" size={30} />
            <p>
              Escolha um veículo para ver a venda, os documentos e os arquivos — e iniciar ou continuar a venda.
            </p>
          </div>
        ) : painelDoCarro ? (
          <PainelVenda
            auth={auth}
            painel={painelDoCarro}
            podeGerenciar={podeGerenciar}
            vendedorPadrao={actor?.authUserId ?? ""}
            vendedorNome={actor?.userName ?? null}
            wizardAberto={wizard}
            onWizard={setWizard}
            onAtualizar={atualizar}
            onVoltar={() => {
              setWizard(false);
              setCarroId(null);
            }}
          />
        ) : !error ? (
          <AbrindoVeiculo item={abrindo && abrindo.carroId === carroId ? abrindo : null} />
        ) : (
          <div className={styles.empty}>
            <Icon name="alert" size={28} />
            <p>{error}</p>
            <button type="button" className={styles.btn} onClick={() => void carregar(carroId)}>
              Tentar de novo
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
