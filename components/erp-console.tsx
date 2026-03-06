"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type LookupItem = { code: string; name: string };

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
  target_id: string;
  valor_anuncio: number | null;
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

type ApiResponse<T> = {
  data: T;
  meta?: { total?: number };
  error?: { message: string };
};

type LookupsPayload = {
  sale_statuses: LookupItem[];
  announcement_statuses: LookupItem[];
  locations: LookupItem[];
};

const defaultHeaders = {
  "Content-Type": "application/json",
  "x-user-role": "ADMINISTRADOR",
  "x-user-name": "dev-admin",
  "x-user-email": "admin@rn-gestor.local"
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "x-user-role": "ADMINISTRADOR",
      "x-user-name": "dev-admin",
      "x-user-email": "admin@rn-gestor.local"
    }
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? "Falha na requisicao");
  }
  return json.data;
}

export function ErpConsole() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lookups, setLookups] = useState<LookupsPayload>({
    sale_statuses: [],
    announcement_statuses: [],
    locations: []
  });
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [carros, setCarros] = useState<Carro[]>([]);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [auditoria, setAuditoria] = useState<Audit[]>([]);

  const [novoModelo, setNovoModelo] = useState("");
  const [novoCarro, setNovoCarro] = useState({ placa: "", nome: "", modelo_id: "", local: "", estado_venda: "" });
  const [novoAnuncio, setNovoAnuncio] = useState({ target_id: "", estado_anuncio: "", valor_anuncio: "" });

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
        target_id: carrosData[0]?.id ?? prev.target_id,
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
        target_id: novoAnuncio.target_id,
        estado_anuncio: novoAnuncio.estado_anuncio,
        valor_anuncio: novoAnuncio.valor_anuncio ? Number(novoAnuncio.valor_anuncio) : null
      })
    });

    if (!response.ok) {
      const json = (await response.json()) as { error?: { message?: string } };
      setError(json.error?.message ?? "Falha ao criar anuncio.");
      return;
    }

    setNovoAnuncio((prev) => ({ ...prev, valor_anuncio: "" }));
    await loadAll();
  }

  async function handleFinalizar(carroId: string) {
    const response = await fetch(`/api/v1/finalizados/${carroId}`, {
      method: "POST",
      headers: defaultHeaders
    });

    if (!response.ok) {
      const json = (await response.json()) as { error?: { message?: string } };
      setError(json.error?.message ?? "Falha ao finalizar carro.");
      return;
    }

    await loadAll();
  }

  async function handleRebuild() {
    const response = await fetch("/api/v1/repetidos/rebuild", {
      method: "POST",
      headers: defaultHeaders
    });

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
        <p>
          Front + back alinhados ao schema tipado do Supabase (`database.types.ts`) com API versionada, auditoria e
          operacoes de dominio.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn" onClick={() => void loadAll()}>
            Atualizar dados
          </button>
          <button type="button" className="btn" onClick={() => void handleRebuild()}>
            Rebuild repetidos
          </button>
        </div>
      </header>

      {error ? <p style={{ color: "#b42318", marginBottom: 14 }}>Erro: {error}</p> : null}
      {loading ? <p>Carregando...</p> : null}

      <section className="kpi-grid">
        {cards.map((card) => (
          <article key={card.title} className="card">
            <h3>{card.title}</h3>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="section-grid" style={{ marginBottom: 16 }}>
        <article className="card">
          <h3>Novo Modelo</h3>
          <form onSubmit={(e) => void handleCreateModelo(e)} style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <input
              className="input"
              placeholder="Nome do modelo"
              value={novoModelo}
              onChange={(e) => setNovoModelo(e.target.value)}
            />
            <button className="btn" type="submit">
              Criar modelo
            </button>
          </form>
        </article>

        <article className="card">
          <h3>Novo Carro</h3>
          <form onSubmit={(e) => void handleCreateCarro(e)} style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <input
              className="input"
              placeholder="Placa"
              value={novoCarro.placa}
              onChange={(e) => setNovoCarro((prev) => ({ ...prev, placa: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Nome"
              value={novoCarro.nome}
              onChange={(e) => setNovoCarro((prev) => ({ ...prev, nome: e.target.value }))}
            />
            <select
              className="input"
              value={novoCarro.modelo_id}
              onChange={(e) => setNovoCarro((prev) => ({ ...prev, modelo_id: e.target.value }))}
            >
              {modelos.map((modelo) => (
                <option key={modelo.id} value={modelo.id}>
                  {modelo.modelo}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={novoCarro.local}
              onChange={(e) => setNovoCarro((prev) => ({ ...prev, local: e.target.value }))}
            >
              {lookups.locations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={novoCarro.estado_venda}
              onChange={(e) => setNovoCarro((prev) => ({ ...prev, estado_venda: e.target.value }))}
            >
              {lookups.sale_statuses.map((status) => (
                <option key={status.code} value={status.code}>
                  {status.name}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">
              Criar carro
            </button>
          </form>
        </article>

        <article className="card">
          <h3>Novo Anuncio</h3>
          <form onSubmit={(e) => void handleCreateAnuncio(e)} style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <select
              className="input"
              value={novoAnuncio.target_id}
              onChange={(e) => setNovoAnuncio((prev) => ({ ...prev, target_id: e.target.value }))}
            >
              {carros.map((carro) => (
                <option key={carro.id} value={carro.id}>
                  {carro.placa} - {carro.nome ?? "Sem nome"}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={novoAnuncio.estado_anuncio}
              onChange={(e) => setNovoAnuncio((prev) => ({ ...prev, estado_anuncio: e.target.value }))}
            >
              {lookups.announcement_statuses.map((status) => (
                <option key={status.code} value={status.code}>
                  {status.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="number"
              placeholder="Valor do anuncio"
              value={novoAnuncio.valor_anuncio}
              onChange={(e) => setNovoAnuncio((prev) => ({ ...prev, valor_anuncio: e.target.value }))}
            />
            <button className="btn" type="submit">
              Criar anuncio
            </button>
          </form>
        </article>
      </section>

      <section className="section-grid">
        <article className="card">
          <h3>Carros</h3>
          <ul className="list" style={{ marginTop: 12 }}>
            {carros.map((carro) => {
              const modeloLabel = Array.isArray(carro.modelos)
                ? carro.modelos[0]?.modelo
                : carro.modelos?.modelo ?? "Sem modelo";
              return (
                <li key={carro.id}>
                  <span>
                    {carro.placa} | {modeloLabel} | {carro.local}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span className="badge" style={{ padding: "4px 10px" }}>
                      {carro.estado_venda}
                    </span>
                    {carro.em_estoque ? (
                      <button className="btn" type="button" onClick={() => void handleFinalizar(carro.id)}>
                        Finalizar
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="card">
          <h3>Anuncios</h3>
          <ul className="list" style={{ marginTop: 12 }}>
            {anuncios.map((anuncio) => {
              const car = Array.isArray(anuncio.carros) ? anuncio.carros[0] : anuncio.carros;
              return (
                <li key={anuncio.id}>
                  <span>
                    {car?.placa ?? "-"} | {anuncio.estado_anuncio}
                  </span>
                  <strong style={{ margin: 0, fontSize: "0.95rem" }}>
                    {anuncio.valor_anuncio
                      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                          anuncio.valor_anuncio
                        )
                      : "--"}
                  </strong>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="card">
          <h3>Auditoria Recente</h3>
          <ul className="list" style={{ marginTop: 12 }}>
            {auditoria.map((item) => (
              <li key={item.id}>
                <span>
                  {item.tabela} | {item.acao} | {item.autor}
                </span>
                <strong style={{ margin: 0, fontSize: "0.85rem" }}>
                  {new Date(item.data_hora).toLocaleString("pt-BR")}
                </strong>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
