"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/atoms/button";
import { Card } from "@/components/atoms/card";
import { Input } from "@/components/atoms/input";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type { ApiEnvelope } from "@/lib/core/types";
type Modelo = { id: string; modelo: string };

type Carro = {
  id: string;
  placa: string;
  nome: string | null;
  local: string;
  estado_venda: string;
  em_estoque: boolean;
  modelo_id: string;
  modelos: { modelo: string } | { modelo: string }[] | null;
};

type Anuncio = {
  id: string;
  estado_anuncio: string;
  carro_id: string;
  valor_anuncio: number | null;
  no_instagram: boolean;
  carros: { placa: string; nome: string | null } | { placa: string; nome: string | null }[] | null;
};

type Audit = {
  id: string;
  tabela: string;
  acao: string;
  autor: string;
  data_hora: string;
  detalhes: string | null;
};

type LookupsPayload = Pick<
  import("@/lib/core/types").LookupsPayload,
  "sale_statuses" | "announcement_statuses" | "locations"
>;

const defaultHeaders = buildRequestHeaders({ accessToken: null, devRole: "ADMINISTRADOR" });

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", headers: defaultHeaders });
  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || json.error) throw new Error(json.error?.message ?? "Falha na requisicao");
  return json.data;
}

export function ErpConsole() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<LookupsPayload>({ sale_statuses: [], announcement_statuses: [], locations: [] });
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [carros, setCarros] = useState<Carro[]>([]);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [auditoria, setAuditoria] = useState<Audit[]>([]);
  const [novoModelo, setNovoModelo] = useState("");
  const [novoCarro, setNovoCarro] = useState({ placa: "", nome: "", modelo_id: "", local: "", estado_venda: "" });
  const [novoAnuncio, setNovoAnuncio] = useState({ carro_id: "", estado_anuncio: "", valor_anuncio: "", no_instagram: false });

  const cards = useMemo(
    () => [
      { title: "Modelos", value: String(modelos.length) },
      { title: "Carros (pagina)", value: String(carros.length) },
      { title: "Anuncios (pagina)", value: String(anuncios.length) },
      { title: "Auditorias (pagina)", value: String(auditoria.length) }
    ],
    [modelos.length, carros.length, anuncios.length, auditoria.length]
  );

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [lookupsData, modelosData, carrosData, anunciosData, auditoriaData] = await Promise.all([
        getJson<LookupsPayload>("/api/v1/lookups"),
        getJson<Modelo[]>("/api/v1/modelos?page=1&page_size=50"),
        getJson<Carro[]>("/api/v1/carros?page=1&page_size=50"),
        getJson<Anuncio[]>("/api/v1/anuncios?page=1&page_size=50"),
        getJson<Audit[]>("/api/v1/auditoria?page=1&page_size=20")
      ]);

      setLookups(lookupsData);
      setModelos(modelosData);
      setCarros(carrosData);
      setAnuncios(anunciosData);
      setAuditoria(auditoriaData);

      setNovoCarro((prev) => ({
        ...prev,
        modelo_id: modelosData[0]?.id ?? prev.modelo_id,
        local: lookupsData.locations[0]?.code ?? prev.local,
        estado_venda: lookupsData.sale_statuses[0]?.code ?? prev.estado_venda
      }));

      setNovoAnuncio((prev) => ({
        ...prev,
        carro_id: carrosData[0]?.id ?? prev.carro_id,
        estado_anuncio: lookupsData.announcement_statuses[0]?.code ?? prev.estado_anuncio
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleCreateModelo(event: FormEvent) {
    event.preventDefault();
    if (!novoModelo.trim()) return;

    const response = await fetch("/api/v1/modelos", {
      method: "POST",
      headers: defaultHeaders,
      body: JSON.stringify({ modelo: novoModelo.trim() })
    });

    if (!response.ok) {
      const json = (await response.json()) as { error?: { message?: string } };
      setError(json.error?.message ?? "Falha ao criar modelo.");
      return;
    }

    setNovoModelo("");
    await loadAll();
  }

  async function handleCreateCarro(event: FormEvent) {
    event.preventDefault();

    const response = await fetch("/api/v1/carros", {
      method: "POST",
      headers: defaultHeaders,
      body: JSON.stringify({
        placa: novoCarro.placa,
        nome: novoCarro.nome || null,
        modelo_id: novoCarro.modelo_id,
        local: novoCarro.local,
        estado_venda: novoCarro.estado_venda,
        em_estoque: true
      })
    });

    if (!response.ok) {
      const json = (await response.json()) as { error?: { message?: string } };
      setError(json.error?.message ?? "Falha ao criar carro.");
      return;
    }

    setNovoCarro((prev) => ({ ...prev, placa: "", nome: "" }));
    await loadAll();
  }

  async function handleCreateAnuncio(event: FormEvent) {
    event.preventDefault();

    const response = await fetch("/api/v1/anuncios", {
      method: "POST",
      headers: defaultHeaders,
      body: JSON.stringify({
        carro_id: novoAnuncio.carro_id,
        estado_anuncio: novoAnuncio.estado_anuncio,
        valor_anuncio: novoAnuncio.valor_anuncio ? Number(novoAnuncio.valor_anuncio) : null,
        no_instagram: novoAnuncio.no_instagram
      })
    });

    if (!response.ok) {
      const json = (await response.json()) as { error?: { message?: string } };
      setError(json.error?.message ?? "Falha ao criar anuncio.");
      return;
    }

    setNovoAnuncio((prev) => ({ ...prev, valor_anuncio: "", no_instagram: false }));
    await loadAll();
  }

  async function handleFinalizar(carroId: string) {
    const response = await fetch(`/api/v1/finalizados/${carroId}`, { method: "POST", headers: defaultHeaders });

    if (!response.ok) {
      const json = (await response.json()) as { error?: { message?: string } };
      setError(json.error?.message ?? "Falha ao finalizar carro.");
      return;
    }

    await loadAll();
  }

  async function handleRebuild() {
    const response = await fetch("/api/v1/repetidos/rebuild", { method: "POST", headers: defaultHeaders });

    if (!response.ok) {
      const json = (await response.json()) as { error?: { message?: string } };
      setError(json.error?.message ?? "Falha ao rebuild de repetidos.");
      return;
    }

    await loadAll();
  }

  return (
    <main className="main-shell">
      <header className="hero">
        <span className="badge">PRD em execucao</span>
        <h1>ERP Web de Estoque e Vendas</h1>
        <p>Front + back alinhados ao schema tipado do Supabase (`database.types.ts`) com API versionada.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button onClick={() => void loadAll()}>Atualizar dados</Button>
          <Button onClick={() => void handleRebuild()}>Rebuild repetidos</Button>
        </div>
      </header>

      {error ? <p style={{ color: "#b42318", marginBottom: 14 }}>Erro: {error}</p> : null}
      {loading ? <p>Carregando...</p> : null}

      <section className="kpi-grid">
        {cards.map((card) => (
          <Card key={card.title}>
            <h3>{card.title}</h3>
            <strong>{card.value}</strong>
          </Card>
        ))}
      </section>

      <section className="section-grid" style={{ marginBottom: 16 }}>
        <Card>
          <h3>Novo Modelo</h3>
          <form onSubmit={(e) => void handleCreateModelo(e)} style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <Input placeholder="Nome do modelo" value={novoModelo} onChange={(e) => setNovoModelo(e.target.value)} />
            <Button type="submit">Criar modelo</Button>
          </form>
        </Card>

        <Card>
          <h3>Novo Carro</h3>
          <form onSubmit={(e) => void handleCreateCarro(e)} style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <Input placeholder="Placa" value={novoCarro.placa} onChange={(e) => setNovoCarro((prev) => ({ ...prev, placa: e.target.value }))} />
            <Input placeholder="Nome" value={novoCarro.nome} onChange={(e) => setNovoCarro((prev) => ({ ...prev, nome: e.target.value }))} />
            <select className="input" value={novoCarro.modelo_id} onChange={(e) => setNovoCarro((prev) => ({ ...prev, modelo_id: e.target.value }))}>
              {modelos.map((modelo) => (
                <option key={modelo.id} value={modelo.id}>{modelo.modelo}</option>
              ))}
            </select>
            <select className="input" value={novoCarro.local} onChange={(e) => setNovoCarro((prev) => ({ ...prev, local: e.target.value }))}>
              {lookups.locations.map((location) => (
                <option key={location.code} value={location.code}>{location.name}</option>
              ))}
            </select>
            <select className="input" value={novoCarro.estado_venda} onChange={(e) => setNovoCarro((prev) => ({ ...prev, estado_venda: e.target.value }))}>
              {lookups.sale_statuses.map((status) => (
                <option key={status.code} value={status.code}>{status.name}</option>
              ))}
            </select>
            <Button type="submit">Criar carro</Button>
          </form>
        </Card>

        <Card>
          <h3>Novo Anuncio</h3>
          <form onSubmit={(e) => void handleCreateAnuncio(e)} style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <select className="input" value={novoAnuncio.carro_id} onChange={(e) => setNovoAnuncio((prev) => ({ ...prev, carro_id: e.target.value }))}>
              {carros.map((carro) => (
                <option key={carro.id} value={carro.id}>{carro.placa} - {carro.nome ?? "Sem nome"}</option>
              ))}
            </select>
            <select className="input" value={novoAnuncio.estado_anuncio} onChange={(e) => setNovoAnuncio((prev) => ({ ...prev, estado_anuncio: e.target.value }))}>
              {lookups.announcement_statuses.map((status) => (
                <option key={status.code} value={status.code}>{status.name}</option>
              ))}
            </select>
            <Input type="number" placeholder="Valor do anuncio" value={novoAnuncio.valor_anuncio} onChange={(e) => setNovoAnuncio((prev) => ({ ...prev, valor_anuncio: e.target.value }))} />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={novoAnuncio.no_instagram}
                onChange={(e) => setNovoAnuncio((prev) => ({ ...prev, no_instagram: e.target.checked }))}
              />
              <span>Publicado no Instagram</span>
            </label>
            <Button type="submit">Criar anuncio</Button>
          </form>
        </Card>
      </section>

      <section className="section-grid">
        <Card>
          <h3>Carros</h3>
          <ul className="list" style={{ marginTop: 12 }}>
            {carros.map((carro) => {
              const modeloLabel = Array.isArray(carro.modelos) ? carro.modelos[0]?.modelo : carro.modelos?.modelo ?? "Sem modelo";
              return (
                <li key={carro.id}>
                  <span>{carro.placa} | {modeloLabel} | {carro.local}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span className="badge" style={{ padding: "4px 10px" }}>{carro.estado_venda}</span>
                    {carro.em_estoque ? <Button onClick={() => void handleFinalizar(carro.id)}>Finalizar</Button> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <h3>Anuncios</h3>
          <ul className="list" style={{ marginTop: 12 }}>
            {anuncios.map((anuncio) => {
              const car = Array.isArray(anuncio.carros) ? anuncio.carros[0] : anuncio.carros;
              return (
                <li key={anuncio.id}>
                  <span>{car?.placa ?? "-"} | {anuncio.estado_anuncio}</span>
                  <span className="badge" style={{ padding: "4px 10px" }}>
                    {anuncio.no_instagram ? "Instagram" : "Sem Instagram"}
                  </span>
                  <strong style={{ margin: 0, fontSize: "0.95rem" }}>
                    {anuncio.valor_anuncio
                      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(anuncio.valor_anuncio)
                      : "--"}
                  </strong>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <h3>Auditoria Recente</h3>
          <ul className="list" style={{ marginTop: 12 }}>
            {auditoria.map((item) => (
              <li key={item.id}>
                <span>{item.tabela} | {item.acao} | {item.autor}</span>
                <strong style={{ margin: 0, fontSize: "0.85rem" }}>{new Date(item.data_hora).toLocaleString("pt-BR")}</strong>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </main>
  );
}
