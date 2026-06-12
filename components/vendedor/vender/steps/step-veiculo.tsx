"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiClientError,
  fetchVendedorCarros,
  type VendedorCarroDetail,
  type VendedorCarroListItem
} from "@/components/ui-grid/api";
import { carroDisplayName, formatPreco, readModelo } from "@/components/vendedor/format";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";

const PAGE_SIZE = 12;

/**
 * Passo 0: escolher o veículo DISPONÍVEL que será vendido. Reusa a busca da
 * vitrine (`available=1`). Quando o wizard chega com `?carro=`, o veículo já
 * vem selecionado e este passo vira só confirmação.
 */
export function StepVeiculo({
  carro,
  onSelect
}: {
  carro: VendedorCarroDetail | null;
  onSelect: (carro: VendedorCarroDetail | null) => void;
}) {
  const auth = useVendedorAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<VendedorCarroListItem[]>([]);
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
        setItems(rows);
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
      {!loading && !error && items.length === 0 ? <p className="vendedor-empty">Nenhum veiculo disponivel encontrado.</p> : null}

      <ul className="vender-veiculo-list" data-testid="vender-veiculo-list">
        {items.map((item) => {
          const preco = formatPreco(item.preco_original);
          return (
            <li key={item.id}>
              <button type="button" className="vender-veiculo-option" onClick={() => onSelect(item as VendedorCarroDetail)}>
                <span className="vender-veiculo-nome">{item.nome?.trim() || readModelo(item.modelos) || item.placa}</span>
                <span className="vender-veiculo-meta">
                  {item.placa}
                  {item.cor ? ` · ${item.cor}` : ""}
                  {item.ano_mod ? ` · ${item.ano_mod}` : ""}
                  {preco ? ` · ${preco}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
