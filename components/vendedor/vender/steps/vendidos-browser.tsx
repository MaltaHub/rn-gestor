"use client";

import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api/http-client";
import type { VendedorCarroDetail, VendedorCarroListItem } from "@/components/ui-grid/api";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { VehicleCard } from "@/components/vendedor/vehicle-card";
import { fetchVendidos } from "@/components/vendedor/vender/api";

const PAGE_SIZE = 24;

/**
 * Navegador de veículos com FICHA FECHADA (vendidos). Cards com a capa do
 * veículo — mais didático do que uma seção dentre todos os veículos. Clicar
 * abre a venda existente em modo edição. Reporta o total para o contador da
 * aba "Vendidos" no stepper.
 */
export function VendidosBrowser({
  onSelect,
  onCount
}: {
  onSelect: (carro: VendedorCarroDetail) => void;
  onCount: (total: number) => void;
}) {
  const auth = useVendedorAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<VendedorCarroListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [q]);

  useEffect(() => {
    const token = (reqRef.current += 1);
    setLoading(true);
    setError(null);
    fetchVendidos(auth, { q: debouncedQ, page: 1, pageSize: PAGE_SIZE })
      .then((page) => {
        if (token !== reqRef.current) return;
        setItems(page.rows);
        setTotal(page.total);
        // Conta total só sem busca (representa o universo de fichas fechadas).
        if (!debouncedQ) onCount(page.total);
      })
      .catch((err: unknown) => {
        if (token !== reqRef.current) return;
        setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao carregar vendidos.");
      })
      .finally(() => {
        if (token === reqRef.current) setLoading(false);
      });
  }, [auth, debouncedQ, onCount]);

  return (
    <div className="vender-step">
      <p className="vendedor-hint">
        Veículos com ficha fechada ou incompleta. Toque em um card para abrir e atualizar a venda.
      </p>
      <input
        type="search"
        className="vendedor-search is-compact"
        placeholder="Buscar vendido por nome ou placa..."
        value={q}
        onChange={(event) => setQ(event.target.value)}
        aria-label="Buscar veículo vendido"
      />

      {error ? <p className="vendedor-error">{error}</p> : null}
      {loading ? <p className="vendedor-hint">Carregando...</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="vendedor-empty">Nenhum veículo com ficha fechada encontrado.</p>
      ) : null}

      <div className="vendedor-grid is-compacto" data-testid="vender-vendidos-list">
        {items.map((item) => (
          <VehicleCard key={item.id} carro={item} mode="compacto" onOpen={() => onSelect(item as VendedorCarroDetail)} />
        ))}
      </div>

      {!loading && total > items.length ? (
        <p className="vendedor-hint">Mostrando {items.length} de {total}. Refine pela busca para encontrar mais.</p>
      ) : null}
    </div>
  );
}
