import "@/styles/vendedor.css";
import "@/styles/catalogo.css";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { listCarros } from "@/lib/domain/carros/service";
import { createCarroShareToken } from "@/lib/domain/carros/share";
import { buildVehicleTitle } from "@/lib/domain/carros/title";

export const dynamic = "force-dynamic";

// Marca exibida na tarja preta do topo (placeholder ate ter o logo).
const BRAND = "RN Veiculos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function readNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let cards: { id: string; href: string; title: string; coverUrl: string | null; preco: string | null }[] = [];
  let failed = false;

  try {
    const { rows } = await listCarros({
      supabase: getSupabaseAdmin(),
      page: 1,
      pageSize: 60,
      q: query || null,
      availableOnly: true,
      withCover: true
    });

    cards = rows.map((row) => {
      const id = String(row.id);
      const preco = readNumber(row, "preco_original");
      return {
        id,
        href: `/galeria/${createCarroShareToken(id)}`,
        title: buildVehicleTitle({
          nome: readString(row, "nome"),
          placa: readString(row, "placa"),
          ano_mod: readNumber(row, "ano_mod"),
          ano_fab: readNumber(row, "ano_fab"),
          hodometro: readNumber(row, "hodometro"),
          cor: readString(row, "cor"),
          modelos: row.modelos
        }),
        coverUrl: readString(row, "cover_url"),
        preco: preco != null ? BRL.format(preco) : null
      };
    });
  } catch {
    failed = true;
  }

  return (
    <div className="catalogo-shell">
      {/* Tarja preta reservada para a marca/logo. */}
      <header className="catalogo-topbar">
        <span className="catalogo-brand">{BRAND}</span>
      </header>

      <main className="catalogo-content">
        <form className="catalogo-search-form" action="/catalogo" method="get">
          <input
            className="vendedor-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar veiculo por nome ou placa..."
            aria-label="Buscar veiculo"
          />
        </form>

        {failed ? (
          <p className="catalogo-empty">Nao foi possivel carregar o catalogo agora.</p>
        ) : cards.length === 0 ? (
          <p className="catalogo-empty">Nenhum veiculo disponivel encontrado.</p>
        ) : (
          <div className="vendedor-grid is-grande">
            {cards.map((card) => (
              <a key={card.id} className="vendedor-card is-grande" href={card.href}>
                {card.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="vendedor-card-cover" src={card.coverUrl} alt={card.title} loading="lazy" />
                ) : (
                  <span className="vendedor-card-cover is-empty" aria-hidden="true">
                    <span>Sem foto</span>
                  </span>
                )}
                <span className="vendedor-card-body">
                  <span className="vendedor-card-name">{card.title}</span>
                  {card.preco ? <span className="vendedor-card-price">{card.preco}</span> : null}
                </span>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
