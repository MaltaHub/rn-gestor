"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiClientError,
  fetchVendedorCarros,
  type VendedorCarroDetail,
  type VendedorCarroListItem
} from "@/components/ui-grid/api";
import { carroDisplayName, formatPreco } from "@/components/vendedor/format";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { VehicleCard } from "@/components/vendedor/vehicle-card";

const PAGE_SIZE = 12;

/**
 * Passo 0: escolher o veículo. Duas seções:
 * - DISPONÍVEIS: inicia uma venda nova.
 * - VENDIDOS: abre a venda existente para atualizar (modo edição).
 * Reusa o VehicleCard da vitrine (grid compacto com capa), ordenado por preço.
 */
export function StepVeiculo({
  carro,
  editing,
  onSelect,
  onSelectVendido
}: {
  carro: VendedorCarroDetail | null;
  editing: boolean;
  onSelect: (carro: VendedorCarroDetail | null) => void;
  onSelectVendido: (carro: VendedorCarroDetail) => void;
}) {
  const auth = useVendedorAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [disponiveis, setDisponiveis] = useState<VendedorCarroListItem[]>([]);
  const [vendidos, setVendidos] = useState<VendedorCarroListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [q]);

  useEffect(() => {
    if (carro) return;
    const token = (reqRef.current += 1);
    setLoading(true);
    setError(null);
    Promise.all([
      fetchVendedorCarros({ requestAuth: auth, q: debouncedQ, page: 1, pageSize: PAGE_SIZE }),
      fetchVendedorCarros({ requestAuth: auth, q: debouncedQ, page: 1, pageSize: PAGE_SIZE, scope: "vendidos" })
    ])
      .then(([rowsDisponiveis, rowsVendidos]) => {
        if (token !== reqRef.current) return;
        setDisponiveis(rowsDisponiveis);
        setVendidos(rowsVendidos);
      })
      .catch((err: unknown) => {
        if (token !== reqRef.current) return;
        setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao carregar veiculos.");
      })
      .finally(() => {
        if (token === reqRef.current) setLoading(false);
      });
  }, [auth, debouncedQ, carro]);

  if (carro) {
    const preco = formatPreco(typeof carro.preco_original === "number" ? carro.preco_original : null);
    return (
      <div className="vender-step">
        <div className="vender-veiculo-selected" data-testid="vender-veiculo-selected">
          <div>
            <strong>{carroDisplayName(carro)}</strong>
            <p>
              Placa {carro.placa}
              {preco ? ` · ${preco}` : ""}
              {editing ? " · atualizando venda existente" : ""}
            </p>
          </div>
          <button type="button" className="vendedor-btn-ghost" onClick={() => onSelect(null)} data-testid="vender-veiculo-trocar">
            Trocar veículo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vender-step">
      <input
        type="search"
        className="vendedor-search"
        placeholder="Buscar veiculo por nome ou placa..."
        value={q}
        onChange={(event) => setQ(event.target.value)}
        data-testid="vender-veiculo-search"
        aria-label="Buscar veiculo para vender"
      />

      {error ? <p className="vendedor-error">{error}</p> : null}
      {loading ? <p className="vendedor-hint">Carregando...</p> : null}

      <section className="vender-veiculo-section">
        <h2>Disponíveis — iniciar venda</h2>
        {!loading && disponiveis.length === 0 ? (
          <p className="vendedor-empty">Nenhum veiculo disponivel encontrado.</p>
        ) : (
          <div className="vendedor-grid is-compacto" data-testid="vender-veiculo-list">
            {disponiveis.map((item) => (
              <VehicleCard key={item.id} carro={item} mode="compacto" onOpen={() => onSelect(item as VendedorCarroDetail)} />
            ))}
          </div>
        )}
      </section>

      <section className="vender-veiculo-section">
        <h2>Vendidos — atualizar venda</h2>
        {!loading && vendidos.length === 0 ? (
          <p className="vendedor-empty">Nenhum veiculo vendido encontrado.</p>
        ) : (
          <div className="vendedor-grid is-compacto" data-testid="vender-vendidos-list">
            {vendidos.map((item) => (
              <VehicleCard key={item.id} carro={item} mode="compacto" onOpen={() => onSelectVendido(item as VendedorCarroDetail)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
