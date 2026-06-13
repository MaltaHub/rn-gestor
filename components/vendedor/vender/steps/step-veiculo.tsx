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

const PAGE_SIZE = 24;

/**
 * Passo 1 do wizard: escolher o veículo DISPONÍVEL para iniciar a venda.
 * Os vendidos (ficha fechada) ficam na aba "Vendidos" do stepper, não aqui.
 * Reusa o VehicleCard da vitrine (grid compacto com capa), ordenado por preço.
 */
export function StepVeiculo({
  carro,
  editing,
  onSelect
}: {
  carro: VendedorCarroDetail | null;
  editing: boolean;
  onSelect: (carro: VendedorCarroDetail | null) => void;
}) {
  const auth = useVendedorAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [disponiveis, setDisponiveis] = useState<VendedorCarroListItem[]>([]);
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
    fetchVendedorCarros({ requestAuth: auth, q: debouncedQ, page: 1, pageSize: PAGE_SIZE })
      .then((rows) => {
        if (token !== reqRef.current) return;
        setDisponiveis(rows);
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
        className="vendedor-search is-compact"
        placeholder="Buscar veiculo por nome ou placa..."
        value={q}
        onChange={(event) => setQ(event.target.value)}
        data-testid="vender-veiculo-search"
        aria-label="Buscar veiculo para vender"
      />

      {error ? <p className="vendedor-error">{error}</p> : null}
      {loading ? <p className="vendedor-hint">Carregando...</p> : null}
      {!loading && disponiveis.length === 0 ? (
        <p className="vendedor-empty">Nenhum veiculo disponivel encontrado.</p>
      ) : (
        <div className="vendedor-grid is-compacto" data-testid="vender-veiculo-list">
          {disponiveis.map((item) => (
            <VehicleCard key={item.id} carro={item} mode="compacto" onOpen={() => onSelect(item as VendedorCarroDetail)} />
          ))}
        </div>
      )}
    </div>
  );
}
