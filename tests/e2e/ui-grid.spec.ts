import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { DEV_ACTOR_AUTH_USER_IDS } from "@/lib/domain/auth-session";

type SheetKey =
  | "carros"
  | "anuncios"
  | "modelos"
  | "grupos_repetidos"
  | "repetidos"
  | "caracteristicas_tecnicas"
  | "caracteristicas_visuais";

type Row = Record<string, unknown>;

type GridState = Record<SheetKey, Row[]>;

test.describe.configure({ retries: 1, timeout: 60_000 });

const BULK_UPLOAD_MASS: string[] = [
'FSG4F22,tracker,07240933-ac80-477f-af91-d5a7c0c44293,Loja 2,DISPONÍVEL,ANUNCIADO,Preparação,sim,Preto,2021,2022,42000,99990',
'FNY7C93,onix,2c7ed08c-5992-4a37-b4e5-49fe8b3f196a,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2022,2023,39000,77990',
'GHI7D01,hb20,6355ce90-c6fe-4184-a145-232356543fef,Loja 1,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Vermelho,2016,2016,108000,65990',
'SID7D36,onix,00d0e090-8d87-49e2-afa8-61329e7610c5,Loja 1,DISPONÍVEL,ANUNCIADO,Preparação,sim,Branco,2023,2024,42000,78990',
'STH1C72,208,9da87701-5c6e-4ad7-aca3-f4eb25b302b4,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2023,2024,44000,71990',
'SDX6F07,voyage,b414d04b-1caf-453c-a521-0e1ca2b4bfaa,Loja 1,DISPONÍVEL,,PRONTO,sim,Preto,2022,2023,69000,61990',
'EKU6C75,onix,2c7ed08c-5992-4a37-b4e5-49fe8b3f196a,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2022,2023,18000,80990',
'FXN1H24,voyage,b414d04b-1caf-453c-a521-0e1ca2b4bfaa,Galpão,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2022,2023,55000,60990',
'FXT9E01,voyage,b414d04b-1caf-453c-a521-0e1ca2b4bfaa,Loja 1,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2022,2023,43000,60990',
'GBK4J73,t-cross,8c915a7a-27c4-4dc8-8dda-b86b6d3bb0b7,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Preto,2022,2022,67000,97990',
'TMJ6H92,stepway,d0929bbb-c82d-4942-bbdd-dce73ae5160d,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2024,2025,72000,72990',
'TCM1J02,argo,8b2626f8-2950-4562-a5d4-1f23ecfd9215,Loja 1,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2024,2025,59000,72990',
'FCL2C74,voyage,b414d04b-1caf-453c-a521-0e1ca2b4bfaa,Galpão,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2022,2023,59000,59990',
'SYA2E89,mobi,9b24ef80-9e44-413f-bcdf-2c043d7d72cb,Loja 1,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2023,2024,27000,58990',
'EZO6B61,voyage,b414d04b-1caf-453c-a521-0e1ca2b4bfaa,Galpão,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2022,2023,43000,60990',
'BSX3F46,onix,2c7ed08c-5992-4a37-b4e5-49fe8b3f196a,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2022,2023,43000,77990',
'FPN1D35,voyage,b414d04b-1caf-453c-a521-0e1ca2b4bfaa,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2022,2023,62000,59990',
'FGT0I44,onix,00d0e090-8d87-49e2-afa8-61329e7610c5,Loja 3,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2022,2022,79000,67990',
'EHR4D97,tracker,a187b224-6201-4a59-80b2-c1b683d4d948,Loja 1,NOVO,ANUNCIADO,PRONTO,sim,Prata,2022,2023,44000,95990',
'RHX5D15,logan,7b439e97-d581-449d-99b4-98b1bf050e3c,Loja 1,DISPONÍVEL,,PRONTO,sim,Branco,2022,2023,40000,59990',
'BZG6C84,voyage,b414d04b-1caf-453c-a521-0e1ca2b4bfaa,Galpão,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2022,2023,50000,59990',
'SOQ1E01,onix,e7f6ed05-f67a-45b4-bc76-8f30a9460efc,Loja 2,DISPONÍVEL,ANUNCIADO,Preparação,sim,Preto,2025,2025,18000,74990',
'CZB2J39,onix,42460dc4-a009-4d9c-afc8-fd2019826a00,Loja 1,DISPONÍVEL,ANUNCIADO,PREPARAÇÃO,sim,Prata,2021,2022,72000,70990',
'DPC1I05,onix,2c7ed08c-5992-4a37-b4e5-49fe8b3f196a,Galpão,NOVO,ANUNCIADO,PRONTO,sim,Prata,2022,2023,63000,75990',
'GHN8H25,kwid,3afc7c6f-9bfd-4700-b4c9-522b71c9ef2d,Loja 3,NOVO,ANUNCIADO,PRONTO,sim,Branco,2021,2022,71000,45990',
'FSX2A73,kwid,3afc7c6f-9bfd-4700-b4c9-522b71c9ef2d,Loja 1,NOVO,ANUNCIADO,PRONTO,sim,Branco,2021,2022,78000,45990',
'SVZ1I61,208,9da87701-5c6e-4ad7-aca3-f4eb25b302b4,Loja 1,NOVO,ANUNCIADO,PRONTO,sim,Branco,2023,2024,43000,71990',
'TDU9B85,onix,4b504346-a5ed-44d7-b8ee-3f6e5f74e24b,Loja 1,NOVO,ANUNCIADO,PREPARAÇÃO,sim,Preto,2024,2025,20000,95990',
'TLI3G46,t-cross,8c915a7a-27c4-4dc8-8dda-b86b6d3bb0b7,Loja 1,NOVO,ANUNCIADO,PRONTO,sim,Prata,2024,2025,12000,124990',
'FCO4C05,gol,8df9fe1d-a83b-4a4d-bdf6-5671f052b68a,Loja 3,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2022,2023,60000,57990',
'RDC7A16,compass,7a5ab6e9-4ba0-446b-8c71-e07b38cbc82e,Loja 3,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2021,2021,53000,95990',
'CUA9G11,gol,8df9fe1d-a83b-4a4d-bdf6-5671f052b68a,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2022,2023,77000,57990',
'FXZ2J65,kwid,3afc7c6f-9bfd-4700-b4c9-522b71c9ef2d,Loja 2,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2021,2022,79000,45990',
'GHP3G13,kwid,3afc7c6f-9bfd-4700-b4c9-522b71c9ef2d,Loja 3,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Branco,2021,2022,78000',
'ELO8J25,hb20,bff064c9-422d-4c6d-95fb-66a3da28cfa2,Loja 1,DISPONÍVEL,ANUNCIADO,PREPARAÇÃO,sim,Preto,2019,2019,55000,59990',
'FCJ9E72,gol,8df9fe1d-a83b-4a4d-bdf6-5671f052b68a,Galpão,DISPONÍVEL,,PRONTO,sim,Prata,2022,2023',
'DEU2C45,gol,8df9fe1d-a83b-4a4d-bdf6-5671f052b68a,Loja 1,DISPONÍVEL,ANUNCIADO,PRONTO,sim,Prata,2022,2023,87000',
'FOV9B22,gol,8df9fe1d-a83b-4a4d-bdf6-5671f052b68a,Loja 1,DISPONÍVEL,,PRONTO,sim,Prata,2022,2023,94000,55990',
'SDT5C00,logan,1f30e1b0-b2de-492a-baae-f569e2936e67,Loja 2,DISPONÍVEL,,PREPARAÇÃO,sim,Branco,2022,2023,80000',
'FGW9E82,onix,00d0e090-8d87-49e2-afa8-61329e7610c5,Loja 1,DISPONÍVEL,,PREPARAÇÃO,sim,Prata,2022,2023,61000',
'FQD5A16,onix,2c7ed08c-5992-4a37-b4e5-49fe8b3f196a,Loja 1,DISPONÍVEL,ANUNCIADO,PREPARAÇÃO,sim,Prata,2022,2023,74000',
'RHR4F88,kwid,3afc7c6f-9bfd-4700-b4c9-522b71c9ef2d,Loja 1,DISPONÍVEL,,PREPARAÇÃO,sim,Branco,2021,2022,55000,56990'
];

const LIVE_AUTH_EMAIL = process.env.E2E_AUTH_EMAIL ?? "";
const LIVE_AUTH_PASSWORD = process.env.E2E_AUTH_PASSWORD ?? "";
const LIVE_TEST_ENABLED = process.env.E2E_LIVE === "1";
const BULK_UPLOAD_MASS_PLATES = BULK_UPLOAD_MASS.map((line) => line.split(",")[0]?.trim().toUpperCase()).filter(Boolean);

const tableConfig = {
  carros: {
    pk: "id",
    label: "Carros",
    header: [
      "id",
      "placa",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_anuncio",
      "estado_veiculo",
      "em_estoque",
      "cor",
      "ano_fab",
      "ano_mod",
      "hodometro",
      "preco_original",
      "created_at",
      "updated_at"
    ]
  },
    anuncios: {
      pk: "id",
      label: "Anuncios",
      header: ["id", "carro_id", "estado_anuncio", "no_instagram", "valor_anuncio", "created_at", "updated_at"]
  },
  modelos: {
    pk: "id",
    label: "Modelos",
    header: ["id", "modelo", "created_at", "updated_at"]
  },
  caracteristicas_tecnicas: {
    pk: "id",
    label: "Caracteristicas Tecnicas",
    header: ["id", "caracteristica", "created_at", "updated_at"]
  },
  caracteristicas_visuais: {
    pk: "id",
    label: "Caracteristicas Visuais",
    header: ["id", "caracteristica", "created_at", "updated_at"]
  },
  grupos_repetidos: {
    pk: "grupo_id",
    label: "Repetidos Grupos",
    header: [
      "grupo_id",
      "modelo_id",
      "cor",
      "ano_mod",
      "preco_original",
      "preco_min",
      "preco_max",
      "hodometro_min",
      "hodometro_max",
      "qtde",
      "atualizado_em",
      "created_at",
      "updated_at"
    ]
  },
  repetidos: {
    pk: "carro_id",
    label: "Repetidos",
    header: ["carro_id", "grupo_id", "created_at", "updated_at"]
  }
} as const;

function nowIso(offset = 0) {
  return new Date(Date.now() + offset).toISOString();
}

function initialState(): GridState {
  return {
    caracteristicas_tecnicas: [
      { id: "tec-1", caracteristica: "Airbag", created_at: nowIso(-50_000), updated_at: nowIso(-50_000) },
      { id: "tec-2", caracteristica: "Cambio automatico", created_at: nowIso(-49_000), updated_at: nowIso(-49_000) }
    ],
    caracteristicas_visuais: [
      { id: "vis-1", caracteristica: "Pintura revisada", created_at: nowIso(-48_000), updated_at: nowIso(-48_000) },
      { id: "vis-2", caracteristica: "Rodas de liga", created_at: nowIso(-47_000), updated_at: nowIso(-47_000) }
    ],
    modelos: [
      { id: "mod-1", modelo: "Civic Touring", created_at: nowIso(-40_000), updated_at: nowIso(-35_000) },
      { id: "mod-2", modelo: "Corolla XEi", created_at: nowIso(-30_000), updated_at: nowIso(-30_000) }
    ],
    carros: [
      {
        id: "car-1",
        placa: "ABC1234",
        nome: "Carro QA 1",
        modelo_id: "mod-1",
        local: "loja_centro",
        estado_venda: "disponivel",
        estado_anuncio: "publicado",
        estado_veiculo: "novo",
        em_estoque: true,
        cor: "preto",
        ano_fab: 2024,
        ano_mod: 2024,
        hodometro: 1200,
        preco_original: 152000,
        created_at: nowIso(-80_000),
        updated_at: nowIso(-80_000)
      },
      {
        id: "car-2",
        placa: "XYZ9988",
        nome: "Carro QA 2",
        modelo_id: "mod-2",
        local: "loja_norte",
        estado_venda: "disponivel",
        estado_anuncio: "rascunho",
        estado_veiculo: "seminovo",
        em_estoque: true,
        cor: "branco",
        ano_fab: 2023,
        ano_mod: 2023,
        hodometro: 28000,
        preco_original: 126500,
        created_at: nowIso(-60_000),
        updated_at: nowIso(-60_000)
      },
      {
        id: "car-3",
        placa: "LMN5566",
        nome: "Carro QA 3",
        modelo_id: "mod-1",
        local: "loja_sul",
        estado_venda: "disponivel",
        estado_anuncio: "publicado",
        estado_veiculo: "seminovo",
        em_estoque: true,
        cor: "azul",
        ano_fab: 2022,
        ano_mod: 2023,
        hodometro: 18000,
        preco_original: 99500,
        created_at: nowIso(-55_000),
        updated_at: nowIso(-55_000)
      }
    ],
    anuncios: [
      {
        id: "ad-1",
        carro_id: "car-1",
        estado_anuncio: "publicado",
        no_instagram: false,
        valor_anuncio: 155900,
        created_at: nowIso(-45_000),
        updated_at: nowIso(-45_000)
      }
    ],
    grupos_repetidos: [
      {
        grupo_id: "grp-1",
        modelo_id: "mod-1",
        cor: "preto",
        ano_mod: 2024,
        preco_original: 152000,
        preco_min: 150000,
        preco_max: 152000,
        hodometro_min: 1000,
        hodometro_max: 1800,
        qtde: 2,
        atualizado_em: nowIso(-10_000),
        created_at: nowIso(-10_000),
        updated_at: nowIso(-10_000)
      }
    ],
    repetidos: [
      { carro_id: "car-1", grupo_id: "grp-1", created_at: nowIso(-10_000), updated_at: nowIso(-10_000) },
      { carro_id: "car-2", grupo_id: "grp-1", created_at: nowIso(-10_000), updated_at: nowIso(-10_000) }
    ]
  };
}

function parseFilters(raw: string | null): Record<string, string> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }

    return out;
  } catch {
    return {};
  }
}

function parseSort(raw: string | null): Array<{ column: string; dir: "asc" | "desc" }> {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Array<{ column?: string; dir?: string }>;
    return parsed
      .filter((item) => typeof item.column === "string" && (item.dir === "asc" || item.dir === "desc"))
      .map((item) => ({ column: item.column as string, dir: item.dir as "asc" | "desc" }));
  } catch {
    return [];
  }
}

function compareValue(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;

  if (typeof a === "number" && typeof b === "number") return a - b;

  return String(a).localeCompare(String(b));
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = initialState();
  const vendas: Row[] = [];
  const carFeatures: Record<string, { visual: string[]; technical: string[] }> = {
    "car-1": { visual: ["vis-1"], technical: ["tec-1"] },
    "car-2": { visual: ["vis-2"], technical: [] },
    "car-3": { visual: [], technical: ["tec-2"] }
  };

  await page.route("**/api/v1/lookups", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user_roles: [
            { code: "VENDEDOR", name: "Vendedor" },
            { code: "SECRETARIO", name: "Secretario" },
            { code: "GERENTE", name: "Gerente" },
            { code: "ADMINISTRADOR", name: "Administrador" }
          ],
          user_statuses: [{ code: "ativo", name: "Ativo" }],
          sale_statuses: [
            { code: "disponivel", name: "Disponível" },
            { code: "novo", name: "NOVO" },
            { code: "vendido", name: "Vendido" }
          ],
          announcement_statuses: [
            { code: "publicado", name: "ANUNCIADO" },
            { code: "rascunho", name: "Rascunho" }
          ],
          locations: [
            { code: "loja_centro", name: "Loja 1" },
            { code: "loja_norte", name: "Loja 2" },
            { code: "loja_sul", name: "Loja 3" }
          ],
          vehicle_states: [
            { code: "novo", name: "Novo" },
            { code: "seminovo", name: "Seminovo" },
            { code: "preparacao", name: "Preparação" }
          ]
        }
      })
    });
  });

  await page.route("**/api/v1/insights/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { byTable: {} } })
    });
  });

  await page.route("**/api/v1/insights/anuncios/missing-rows", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { rows: [] } })
    });
  });

  await page.route("**/api/v1/repetidos/rebuild", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    state.grupos_repetidos = [
      {
        grupo_id: "grp-rebuild",
        modelo_id: "mod-1",
        cor: "preto",
        ano_mod: 2024,
        preco_original: 152000,
        preco_min: 150000,
        preco_max: 152000,
        hodometro_min: 1000,
        hodometro_max: 1800,
        qtde: 2,
        atualizado_em: nowIso(),
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];

    state.repetidos = state.carros.slice(0, 2).map((car) => ({
      carro_id: String(car.id),
      grupo_id: "grp-rebuild",
      created_at: nowIso(),
      updated_at: nowIso()
    }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { grupos_repetidos: state.grupos_repetidos.length, registros_repetidos: state.repetidos.length } })
    });
  });

  await page.route("**/api/v1/finalizados/*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const id = url.pathname.split("/").pop() as string;
    const car = state.carros.find((row) => String(row.id) === id);

    if (!car) {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: { message: "Nao encontrado" } }) });
      return;
    }

    car.em_estoque = false;
    car.estado_venda = "vendido";
    car.updated_at = nowIso();

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { finalizado: { id }, carro: car } })
    });
  });

  await page.route("**/api/v1/carros/*/caracteristicas", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const carrosIndex = parts.findIndex((part) => part === "carros");
    const carroId = carrosIndex >= 0 ? parts[carrosIndex + 1] : "";

    if (!carroId || !state.carros.some((row) => String(row.id) === carroId)) {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: { message: "Carro nao encontrado" } }) });
      return;
    }

    if (request.method() === "GET") {
      const features = carFeatures[carroId] ?? { visual: [], technical: [] };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            caracteristicas_visuais_ids: features.visual,
            caracteristicas_tecnicas_ids: features.technical
          }
        })
      });
      return;
    }

    if (request.method() === "PUT") {
      const body = (request.postDataJSON() as {
        caracteristicas_visuais_ids?: string[];
        caracteristicas_tecnicas_ids?: string[];
      }) ?? {};
      carFeatures[carroId] = {
        visual: Array.isArray(body.caracteristicas_visuais_ids) ? body.caracteristicas_visuais_ids : [],
        technical: Array.isArray(body.caracteristicas_tecnicas_ids) ? body.caracteristicas_tecnicas_ids : []
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            caracteristicas_visuais_ids: carFeatures[carroId].visual,
            caracteristicas_tecnicas_ids: carFeatures[carroId].technical
          }
        })
      });
      return;
    }

    await route.fulfill({ status: 405, body: JSON.stringify({ error: { message: "Metodo nao suportado" } }) });
  });

  await page.route("**/api/v1/vendas**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET") {
      const carroId = url.searchParams.get("carro_id");
      const estadoVenda = url.searchParams.get("estado_venda");
      const rows = vendas.filter((venda) => {
        const matchesCarro = !carroId || String(venda.carro_id) === carroId;
        const matchesEstado = !estadoVenda || String(venda.estado_venda) === estadoVenda;
        return matchesCarro && matchesEstado;
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows })
      });
      return;
    }

    if (request.method() === "POST") {
      const body = (request.postDataJSON() as Row) ?? {};
      const row = {
        id: `ven-${vendas.length + 1}`,
        data_venda: new Date().toISOString().slice(0, 10),
        estado_venda: "concluida",
        created_at: nowIso(),
        updated_at: nowIso(),
        ...body
      };
      vendas.push(row);

      const car = state.carros.find((item) => String(item.id) === String(row.carro_id));
      if (car) {
        car.estado_venda = "vendido";
        car.em_estoque = false;
        car.updated_at = nowIso();
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: row })
      });
      return;
    }

    await route.fulfill({ status: 405, body: JSON.stringify({ error: { message: "Metodo nao suportado" } }) });
  });

  await page.route("**/api/v1/grid/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((part) => part === "grid");

    if (idx === -1) {
      await route.fallback();
      return;
    }

    const table = parts[idx + 1] as SheetKey | undefined;
    const id = parts[idx + 2];

    if (!table || !(table in state)) {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: { message: "Tabela nao suportada" } }) });
      return;
    }

    const config = tableConfig[table];

    if (request.method() === "GET") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      const filters = parseFilters(url.searchParams.get("filters"));
      const sort = parseSort(url.searchParams.get("sort"));

      let rows = [...state[table]];

      if (query) {
        rows = rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query)));
      }

      for (const [column, expressionRaw] of Object.entries(filters)) {
        const expression = expressionRaw.trim();
        if (!expression) continue;

        if (expression.includes("|")) {
          const allowed = new Set(
            expression
              .split("|")
              .map((item) => item.trim().toLowerCase())
              .filter(Boolean)
          );
          rows = rows.filter((row) => allowed.has(String(row[column] ?? "").toLowerCase()));
          continue;
        }

        if (expression.startsWith("=")) {
          const target = expression.slice(1).trim().toLowerCase();
          rows = rows.filter((row) => String(row[column] ?? "").toLowerCase() === target);
          continue;
        }

        rows = rows.filter((row) => String(row[column] ?? "").toLowerCase().includes(expression.toLowerCase()));
      }

      const sortChain = sort.length > 0 ? sort : [{ column: config.header[0], dir: "asc" as const }];
      rows.sort((a, b) => {
        for (const rule of sortChain) {
          const comparison = compareValue(a[rule.column], b[rule.column]);
          if (comparison !== 0) {
            return rule.dir === "asc" ? comparison : -comparison;
          }
        }
        return 0;
      });

      const totalRows = rows.length;
      const from = (page - 1) * pageSize;
      const paged = rows.slice(from, from + pageSize);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            table,
            label: config.label,
            header: config.header,
            rows: paged,
            totalRows,
            page,
            pageSize,
            sort: sortChain,
            filters
          }
        })
      });
      return;
    }

    if (request.method() === "POST") {
      const body = (request.postDataJSON() as { row?: Row }) ?? {};
      const row = body.row ?? {};
      const pk = config.pk;
      const pkValue = row[pk];

      if (typeof pkValue === "string" && pkValue.length > 0) {
        const index = state[table].findIndex((item) => String(item[pk]) === pkValue);
        if (index >= 0) {
          state[table][index] = {
            ...state[table][index],
            ...row,
            updated_at: nowIso()
          };
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { operation: "update", row: state[table][index] } })
        });
        return;
      }

      const newId = `${table.slice(0, 3)}-${Math.floor(Math.random() * 1000000)}`;
      const newRow = {
        ...row,
        [pk]: newId,
        created_at: nowIso(),
        updated_at: nowIso()
      };

      state[table].push(newRow);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { operation: "insert", row: newRow } })
      });
      return;
    }

    if (request.method() === "DELETE" && id) {
      state[table] = state[table].filter((item) => String(item[config.pk]) !== id);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { deleted: true, id } })
      });
      return;
    }

    await route.fulfill({ status: 405, body: JSON.stringify({ error: { message: "Metodo nao suportado" } }) });
  });
});

async function openApp(page: Page, role: "VENDEDOR" | "SECRETARIO" | "GERENTE" | "ADMINISTRADOR" = "ADMINISTRADOR") {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const grid = page.getByTestId("holistic-sheet");
  const devSubmit = page.getByTestId("auth-dev-submit");
  const authPanel = page.getByTestId("auth-dev-panel");

  await Promise.race([grid.waitFor({ state: "visible" }), authPanel.waitFor({ state: "visible" })]);

  if (await authPanel.isVisible()) {
    await page.getByTestId("auth-dev-role").selectOption(role);
    await devSubmit.click();
  }

  await expect(grid).toBeVisible();
  await expect(page.getByTestId("sheet-tab-carros")).toBeVisible();
}

async function switchSheet(page: Page, sheetKey: SheetKey, expectedText: string) {
  const tab = page.getByTestId(`sheet-tab-${sheetKey}`);
  const table = page.getByTestId("sheet-grid-table");

  await expect(tab).toBeVisible();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await tab.evaluate((node) => (node as HTMLButtonElement).click());

    try {
      await expect
        .poll(() => tab.evaluate((node) => node.classList.contains("is-active")), { timeout: 3_000 })
        .toBe(true);
      await expect(table).toContainText(expectedText, { timeout: 4_000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      await page.waitForTimeout(150);
    }
  }
}

function getLiveSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    throw new Error("Variaveis do Supabase ausentes para o teste live.");
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function cleanupBulkUploadMassRows() {
  const supabase = getLiveSupabaseAdmin();
  const { error } = await supabase.from("carros").delete().in("placa", BULK_UPLOAD_MASS_PLATES);

  if (error) {
    throw new Error(`Falha ao limpar carros do BULK_UPLOAD_MASS: ${error.message}`);
  }
}

async function countBulkUploadMassRows() {
  const supabase = getLiveSupabaseAdmin();
  const { count, error } = await supabase.from("carros").select("*", { count: "exact", head: true }).in("placa", BULK_UPLOAD_MASS_PLATES);

  if (error) {
    throw new Error(`Falha ao contar carros do BULK_UPLOAD_MASS: ${error.message}`);
  }

  return count ?? 0;
}

async function useLiveApiRoutes(page: Page) {
  await page.unroute("**/api/v1/lookups");
  await page.unroute("**/api/v1/insights/summary");
  await page.unroute("**/api/v1/insights/anuncios/missing-rows");
  await page.unroute("**/api/v1/repetidos/rebuild");
  await page.unroute("**/api/v1/finalizados/*");
  await page.unroute("**/api/v1/carros/*/caracteristicas");
  await page.unroute("**/api/v1/grid/**");
}

async function openAppWithSavedCredentials(page: Page) {
  if (!LIVE_AUTH_EMAIL || !LIVE_AUTH_PASSWORD) {
    throw new Error("Credenciais E2E ausentes. Configure E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD.");
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const grid = page.getByTestId("holistic-sheet");
  const authEmail = page.getByTestId("auth-email");

  await Promise.race([grid.waitFor({ state: "visible" }), authEmail.waitFor({ state: "visible" })]);

  if (await authEmail.isVisible()) {
    await page.getByTestId("auth-mode-login").click();
    await page.getByTestId("auth-email").fill(LIVE_AUTH_EMAIL);
    await page.getByTestId("auth-password").fill(LIVE_AUTH_PASSWORD);
    await page.getByTestId("auth-submit").click();

    try {
      await expect(grid).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      const authError = page.getByTestId("auth-error");
      if (await authError.isVisible().catch(() => false)) {
        throw new Error(`Falha no login real: ${await authError.innerText()}`);
      }
      throw error;
    }
  }

  await expect(grid).toBeVisible();
  await expect(page.getByTestId("sheet-tab-carros")).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
}

async function installPrintCapture(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture = {
      html: "",
      printed: false
    };

    window.open = (() => {
      return {
        addEventListener(event: string, callback: () => void) {
          if (event === "load") callback();
        },
        document: {
          open() {},
          write(html: string) {
            (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.html = html;
          },
          close() {}
        },
        focus() {},
        print() {
          (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed = true;
        }
      } as Window;
    }) as typeof window.open;
  });
}

test("renderiza grid minimalista com controles iconicos e troca de sheet", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("action-reload")).toBeVisible();
  await expect(page.getByTestId("action-insert-row")).toBeVisible();
  await expect(page.getByTestId("action-insert-bulk")).toBeVisible();
  await expect(page.getByTestId("action-rebuild-repetidos")).toBeVisible();
  await expect(page.getByRole("button", { name: "Inserir linha" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Insert em massa" })).toBeVisible();

  await switchSheet(page, "modelos", "Civic Touring");
  await expect(page.getByTestId("cell-modelos-0-modelo")).toBeVisible();
});

test("colapsa a sidebar no mobile e mantem a paginacao no topo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await expect(page.locator(".sheet-topbar [data-testid='sheet-pager']")).toBeVisible();
  await expect(page.locator(".sheet-footer")).toHaveCount(0);

  const backdrop = page.getByTestId("sheet-sidebar-backdrop");
  await expect(backdrop).not.toHaveClass(/is-open/);

  await page.getByTestId("sidebar-toggle").click();
  await expect(backdrop).toHaveClass(/is-open/);
  await expect(page.getByTestId("sidebar-close")).toBeVisible();
  await expect(page.getByTestId("sheet-tab-modelos")).toBeVisible();

  await switchSheet(page, "modelos", "Civic Touring");
  await expect(backdrop).not.toHaveClass(/is-open/);
});

test("no mobile horizontal reserva altura util para o grid", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openApp(page);

  const gridContainerBox = await page.getByTestId("sheet-grid-container").boundingBox();
  const searchPanelBox = await page.getByTestId("toolbar-grid-search").boundingBox();

  if (!gridContainerBox || !searchPanelBox) {
    throw new Error("Nao foi possivel medir o grid em mobile horizontal.");
  }

  expect(gridContainerBox.height).toBeGreaterThanOrEqual(250);
  expect(Math.abs(searchPanelBox.y + searchPanelBox.height - gridContainerBox.y)).toBeLessThanOrEqual(12);
});

test("no mobile o handler ocupa a tela inteira e mantem headers fixos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await page.getByTestId("action-insert-row").click();
  await expect(page.getByTestId("sheet-grid-panel")).toHaveCount(0);
  await expect(page.getByTestId("sheet-form-panel")).toBeVisible();

  const insertPanelLayout = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="sheet-form-panel"]') as HTMLElement | null;
    const topbar = document.querySelector('[data-testid="form-topbar"]') as HTMLElement | null;

    return {
      panelPosition: panel ? window.getComputedStyle(panel).position : "",
      panelHeight: panel?.getBoundingClientRect().height ?? 0,
      viewportHeight: window.innerHeight,
      topbarPosition: topbar ? window.getComputedStyle(topbar).position : ""
    };
  });

  expect(insertPanelLayout.panelPosition).toBe("fixed");
  expect(insertPanelLayout.topbarPosition).toBe("sticky");
  expect(insertPanelLayout.panelHeight).toBeGreaterThanOrEqual(insertPanelLayout.viewportHeight - 2);

  await page.getByTestId("panel-close-form").click();
  await expect(page.getByTestId("sheet-grid-panel")).toBeVisible();

  await page.getByTestId("mode-toggle-editor").click();
  await page.getByTestId("cell-carros-0-placa").click();
  await expect(page.getByTestId("sheet-grid-panel")).toHaveCount(0);
  await expect(page.getByTestId("sheet-form-panel")).toBeVisible();

  const updatePanelLayout = await page.evaluate(() => {
    const topbar = document.querySelector('[data-testid="form-topbar"]') as HTMLElement | null;
    return {
      topbarPosition: topbar ? window.getComputedStyle(topbar).position : ""
    };
  });

  expect(updatePanelLayout.topbarPosition).toBe("sticky");
});

test("no mobile preserva o scroll global ao abrir e fechar formulario", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");

  const scrollBefore = await page.evaluate(() => {
    const style = document.createElement("style");
    style.setAttribute("data-test-id", "mobile-scroll-height");
    style.textContent = '[data-testid="sheet-grid-panel"] { min-height: 1800px !important; }';
    document.head.appendChild(style);
    window.scrollTo(0, 640);
    return Math.round(window.scrollY);
  });

  expect(scrollBefore).toBeGreaterThan(0);

  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(scrollBefore);

  await page.getByTestId("action-insert-row").evaluate((node) => {
    (node as HTMLButtonElement).click();
  });

  await expect(page.getByTestId("sheet-form-panel")).toBeVisible();

  await page.getByTestId("panel-close-form").click();

  await expect(page.getByTestId("sheet-form-panel")).toHaveCount(0);
  await expect(page.getByTestId("sheet-grid-panel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(scrollBefore);
});

test("no mobile reorganiza a toolbar e reabre o grid apos criar carro", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await expect(page.locator(".sheet-session-actions").getByRole("link", { name: "Arquivos" })).toBeVisible();
  await expect(page.locator(".sheet-session-actions").getByRole("button", { name: "Imprimir" })).toBeVisible();
  await expect(page.locator(".sheet-session-actions").getByRole("button", { name: "Sair" })).toBeVisible();

  const searchBox = await page.getByPlaceholder("Buscar...").boundingBox();
  const matchBox = await page.locator(".sheet-toolbar-controls-primary select").boundingBox();
  const reloadBox = await page.getByTestId("action-reload").boundingBox();
  const insertBox = await page.getByTestId("action-insert-row").boundingBox();
  const searchPanelBox = await page.getByTestId("toolbar-grid-search").boundingBox();
  const gridContainerBox = await page.getByTestId("sheet-grid-container").boundingBox();

  if (!searchBox || !matchBox || !reloadBox || !insertBox || !searchPanelBox || !gridContainerBox) {
    throw new Error("Nao foi possivel medir a toolbar mobile.");
  }

  expect(Math.abs(searchBox.y - matchBox.y)).toBeLessThanOrEqual(6);
  expect(Math.abs(matchBox.y - reloadBox.y)).toBeLessThanOrEqual(6);
  expect(searchBox.y).toBeGreaterThan(insertBox.y + 8);
  expect(Math.abs(searchPanelBox.y + searchPanelBox.height - gridContainerBox.y)).toBeLessThanOrEqual(12);

  await page.getByTestId("action-insert-row").click();
  await expect(page.getByTestId("sheet-form-panel")).toBeVisible();
  await expect(page.getByTestId("form-field-placa")).toBeFocused();
  await page.keyboard.type("MOB1234");
  await expect(page.getByTestId("form-field-placa")).toHaveValue("MOB1234");
  await page.getByTestId("form-field-nome").fill("Carro Mobile QA");
  await page.getByTestId("form-field-modelo_id").fill("Civic Touring");
  await page.getByTestId("form-submit").click();

  await expect(page.getByTestId("sheet-form-panel")).toHaveCount(0);
  await expect(page.getByTestId("sheet-grid-panel")).toBeVisible();
  await expect(page.getByTestId("sheet-grid-table")).toContainText("MOB1234");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("Carro Mobile QA");
});

test("restringe navegacao sensivel e escrita para vendedor", async ({ page }) => {
  await openApp(page, "VENDEDOR");

  await expect(page.getByTestId("sheet-tab-carros")).toBeVisible();
  await expect(page.getByTestId("sheet-tab-usuarios_acesso")).toHaveCount(0);
  await expect(page.getByTestId("sheet-tab-log_alteracoes")).toHaveCount(0);
  await expect(page.getByTestId("sheet-tab-lookup_user_roles")).toHaveCount(0);
  await expect(page.getByTestId("action-insert-row")).toBeDisabled();
  await expect(page.getByTestId("action-insert-bulk")).toBeDisabled();
  await expect(page.getByTestId("action-delete-rows")).toBeDisabled();
  await expect(page.getByTestId("action-finalize-rows")).toBeDisabled();
  await expect(page.getByTestId("action-rebuild-repetidos")).toBeDisabled();
});

test("modulo de insercao abre em split com resize e botoes de fechamento", async ({ page }) => {
  await openApp(page);
  await switchSheet(page, "modelos", "Civic Touring");
  await page.getByTestId("action-insert-row").click();

  await expect(page.getByTestId("sheet-grid-panel")).toBeVisible();
  await expect(page.getByTestId("sheet-form-panel")).toBeVisible();
  await expect(page.getByTestId("sheet-splitter")).toBeVisible();
  await expect(page.getByTestId("panel-close-grid")).toBeVisible();
  await expect(page.getByTestId("panel-close-form")).toBeVisible();
  await expect(page.getByTestId("form-topbar")).toBeVisible();

  const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasPageOverflow).toBe(false);

  const gridWidthBefore = await page.getByTestId("sheet-grid-panel").evaluate((node) => (node as HTMLElement).getBoundingClientRect().width);
  const splitter = page.getByTestId("sheet-splitter");
  const splitterBox = await splitter.boundingBox();
  if (!splitterBox) {
    throw new Error("Splitter do workspace nao encontrado.");
  }

  await splitter.evaluate((node, deltaX) => {
    const rect = (node as HTMLElement).getBoundingClientRect();
    const startX = rect.x + rect.width / 2;
    const startY = rect.y + rect.height / 2;
    const eventInit = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true };

    node.dispatchEvent(new PointerEvent("pointerdown", { ...eventInit, clientX: startX, clientY: startY, buttons: 1 }));
    window.dispatchEvent(new PointerEvent("pointermove", { ...eventInit, clientX: startX + deltaX, clientY: startY, buttons: 1 }));
    window.dispatchEvent(new PointerEvent("pointerup", { ...eventInit, clientX: startX + deltaX, clientY: startY, buttons: 0 }));
  }, -120);

  await expect
    .poll(() =>
      page.getByTestId("sheet-grid-panel").evaluate((node) => (node as HTMLElement).getBoundingClientRect().width)
    )
    .toBeLessThan(gridWidthBefore);

  const topBefore = await page.getByTestId("form-topbar").evaluate((node) => (node as HTMLElement).getBoundingClientRect().top);
  await page.locator(".sheet-form-panel-body").evaluate((node) => {
    node.scrollTop = 180;
  });
  const topAfter = await page.getByTestId("form-topbar").evaluate((node) => (node as HTMLElement).getBoundingClientRect().top);
  expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(1);

  await page.getByTestId("panel-close-grid").click();
  await expect(page.getByTestId("sheet-grid-panel")).toHaveCount(0);
  await expect(page.getByTestId("sheet-form-panel")).toBeVisible();

  await page.getByTestId("panel-close-form").click();
  await expect(page.getByTestId("sheet-form-panel")).toHaveCount(0);
  await expect(page.getByTestId("sheet-grid-panel")).toBeVisible();
});

test("filtro por tooltip da coluna aplica dinamicamente", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");

  await page.getByTestId("filter-trigger-local").click();
  await expect(page.getByTestId("filter-popover-local")).toBeVisible();
  await page.getByTestId("filter-option-local-loja_centro").click();
  await page.getByTestId("filter-apply-local").click();

  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).not.toContainText("XYZ9988");

  await page.getByTestId("filter-trigger-local").click();
  await page.getByTestId("filter-clear-local").click();
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");
});

test("filtros encadeados mostram apenas valores presentes no sheet atual", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");

  await page.getByTestId("filter-trigger-local").click();
  await page.getByTestId("filter-option-local-loja_centro").click();
  await page.getByTestId("filter-apply-local").click();
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).not.toContainText("XYZ9988");

  await page.getByTestId("filter-trigger-estado_anuncio").click();
  await expect(page.getByTestId("filter-option-estado_anuncio-publicado")).toBeVisible();
  await expect(page.getByTestId("filter-option-estado_anuncio-rascunho")).toHaveCount(0);
});

test("tooltip de filtro e renderizado fora do grid sem corte", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("filter-trigger-local").click();

  const isFixed = await page.evaluate(() => {
    const popover = document.querySelector('[data-testid="filter-popover-local"]') as HTMLElement | null;
    if (!popover) return false;
    return window.getComputedStyle(popover).position === "fixed";
  });

  expect(isFixed).toBe(true);
});

test("botao de filtro permanece visivel apos resize extremo da coluna", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");

  const handle = page.getByTestId("resize-handle-placa");
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Resize handle da coluna 'placa' nao encontrado.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 360, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId("filter-trigger-placa")).toBeVisible();
});

test("expansao manual de dados troca exibicao da coluna relacional", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("cell-carros-0-modelo_id")).toContainText("mod-1");

  await page.getByTestId("filter-trigger-modelo_id").click();
  await page.getByTestId("relation-expand-modelo_id").click();

  await expect(page.getByTestId("relation-dialog")).toBeVisible();
  await page.getByTestId("relation-option-modelo_id-modelo").click();

  await expect(page.getByTestId("relation-dialog")).toHaveCount(0);
  await expect(page.getByTestId("cell-carros-0-modelo_id")).toContainText("Civic Touring");
  await expect(page.getByTestId("cell-carros-1-modelo_id")).toContainText("Corolla XEi");

  await page.getByTestId("filter-trigger-modelo_id").click();
  const popover = page.getByTestId("filter-popover-modelo_id");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Civic Touring");
  await expect(popover).toContainText("Corolla XEi");
  await expect(popover).not.toContainText("mod-1");
  await expect(popover).not.toContainText("mod-2");
});

test("impressao usa escopo tabela com filtro e expansao proprios sem afetar o grid", async ({ page }) => {
  await installPrintCapture(page);
  await openApp(page);

  await page.getByTestId("filter-trigger-local").click();
  await page.getByTestId("filter-option-local-loja_norte").click();
  await page.getByTestId("filter-apply-local").click();

  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");
  await expect(page.getByTestId("sheet-grid-table")).not.toContainText("ABC1234");

  await page.getByTestId("action-print-table").click();
  await expect(page.getByTestId("print-dialog")).toBeVisible();
  await expect(page.getByTestId("print-scope")).toHaveValue("table");

  await page.getByTestId("print-columns-clear").click();
  await page.getByTestId("print-column-toggle-modelo_id").check();
  await page.getByTestId("print-column-toggle-placa").check();
  await page.getByTestId("print-column-label-modelo_id").fill("Modelo Print");

  await page.getByTestId("print-column-filter-local").click();
  await expect(page.getByTestId("print-filter-popover-local")).toBeVisible();
  await page.getByTestId("print-filter-option-local-loja_centro").click();
  await page.getByTestId("print-filter-apply-local").click();

  await page.getByTestId("print-column-filter-modelo_id").click();
  await page.getByTestId("print-relation-expand-modelo_id").click();
  await expect(page.getByTestId("relation-dialog")).toBeVisible();
  await page.getByTestId("relation-option-modelo_id-modelo").click();

  await page.getByTestId("print-submit").click();
  await page.waitForFunction(() => {
    return (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed;
  });

  const capture = await page.evaluate(() => (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture);
  expect(capture.html).toContain("Modelo Print");
  expect(capture.html).toContain("Civic Touring");
  expect(capture.html).toContain("ABC1234");
  expect(capture.html).not.toContain("XYZ9988");
  expect(capture.html).not.toContain("mod-1");

  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");
  await expect(page.getByTestId("sheet-grid-table")).not.toContainText("ABC1234");
});

test("escopos filtrado e selecionado nao expoem filtro ou expansao propria da impressao", async ({ page }) => {
  await installPrintCapture(page);
  await openApp(page);

  await page.getByTestId("filter-trigger-local").click();
  await page.getByTestId("filter-option-local-loja_norte").click();
  await page.getByTestId("filter-apply-local").click();

  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");
  await expect(page.getByTestId("sheet-grid-table")).not.toContainText("ABC1234");

  await page.getByTestId("action-print-table").click();
  await expect(page.getByTestId("print-dialog")).toBeVisible();

  await page.getByTestId("print-columns-clear").click();
  await page.getByTestId("print-column-toggle-modelo_id").check();
  await page.getByTestId("print-column-toggle-placa").check();

  await page.getByTestId("print-column-filter-local").click();
  await page.getByTestId("print-filter-option-local-loja_centro").click();
  await page.getByTestId("print-filter-apply-local").click();

  await page.getByTestId("print-column-filter-modelo_id").click();
  await page.getByTestId("print-relation-expand-modelo_id").click();
  await expect(page.getByTestId("relation-dialog")).toBeVisible();
  await page.getByTestId("relation-option-modelo_id-modelo").click();

  await page.getByTestId("print-scope").selectOption("filtered");
  await expect(page.getByTestId("print-column-filter-local")).toHaveCount(0);
  await expect(page.getByTestId("print-column-filter-modelo_id")).toHaveCount(0);
  await expect(page.getByTestId("relation-dialog")).toHaveCount(0);

  await page.getByTestId("print-submit").click();
  await page.waitForFunction(() => {
    return (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed;
  });

  const capture = await page.evaluate(() => (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture);
  expect(capture.html).toContain("XYZ9988");
  expect(capture.html).not.toContain("ABC1234");
  expect(capture.html).toContain("mod-2");
  expect(capture.html).not.toContain("Corolla XEi");
});

test("escopo filtrado preserva a ordem do grid e respeita a posicao base das colunas", async ({ page }) => {
  await installPrintCapture(page);
  await openApp(page);

  await page.getByText("placa", { exact: true }).click();
  await page.getByText("placa", { exact: true }).click();

  await expect(page.getByTestId("cell-carros-0-placa")).toContainText("XYZ9988");
  await expect(page.getByTestId("cell-carros-1-placa")).toContainText("LMN5566");
  await expect(page.getByTestId("cell-carros-2-placa")).toContainText("ABC1234");

  await page.getByTestId("action-print-table").click();
  await expect(page.getByTestId("print-dialog")).toBeVisible();

  await page.getByTestId("print-columns-clear").click();
  await page.getByTestId("print-column-toggle-modelo_id").check();
  await page.getByTestId("print-column-toggle-placa").check();
  await page.getByTestId("print-sort-column").selectOption("placa");
  await page.getByTestId("print-sort-direction").selectOption("asc");
  await page.getByTestId("print-scope").selectOption("filtered");
  await expect(page.getByTestId("print-sort-column")).toBeDisabled();
  await expect(page.getByTestId("print-sort-direction")).toBeDisabled();
  await page.getByTestId("print-submit").click();

  await page.waitForFunction(() => {
    return (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed;
  });

  const capture = await page.evaluate(() => (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture);
  const placaHeaderIndex = capture.html.indexOf("<th>placa</th>");
  const modeloHeaderIndex = capture.html.indexOf("<th>modelo_id</th>");
  const xyzIndex = capture.html.indexOf("XYZ9988");
  const lmnIndex = capture.html.indexOf("LMN5566");
  const abcIndex = capture.html.indexOf("ABC1234");

  expect(placaHeaderIndex).toBeGreaterThanOrEqual(0);
  expect(modeloHeaderIndex).toBeGreaterThanOrEqual(0);
  expect(placaHeaderIndex).toBeLessThan(modeloHeaderIndex);
  expect(xyzIndex).toBeGreaterThanOrEqual(0);
  expect(lmnIndex).toBeGreaterThanOrEqual(0);
  expect(abcIndex).toBeGreaterThanOrEqual(0);
  expect(xyzIndex).toBeLessThan(lmnIndex);
  expect(lmnIndex).toBeLessThan(abcIndex);
  expect(capture.html).not.toContain("Ordenado por placa");
});

test("dialogo de impressao restaura a ultima configuracao usada", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("action-print-table").click();
  await expect(page.getByTestId("print-dialog")).toBeVisible();

  await page.getByTestId("print-title").fill("Tabela persistida");
  await page.getByTestId("print-columns-clear").click();
  await page.getByTestId("print-column-toggle-modelo_id").check();
  await page.getByTestId("print-column-toggle-placa").check();
  await page.getByTestId("print-sort-column").selectOption("placa");
  await page.getByTestId("print-sort-direction").selectOption("desc");
  await page.getByTestId("print-dialog-close").click();
  await expect(page.getByTestId("print-dialog")).toHaveCount(0);

  await page.getByTestId("action-print-table").click();
  await expect(page.getByTestId("print-dialog")).toBeVisible();
  await expect(page.getByTestId("print-title")).toHaveValue("Tabela persistida");
  await expect(page.getByTestId("print-sort-column")).toHaveValue("placa");
  await expect(page.getByTestId("print-sort-direction")).toHaveValue("desc");
  await expect(page.getByTestId("print-column-toggle-modelo_id")).toBeChecked();
  await expect(page.getByTestId("print-column-toggle-placa")).toBeChecked();
  await expect(page.getByTestId("print-column-toggle-id")).not.toBeChecked();
});

test("filtro permite fixar uma coluna por vez e ocultar ou restaurar colunas", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("filter-trigger-placa").click();
  await page.getByTestId("filter-pin-placa").click();

  await expect(page.locator("thead .sheet-pinned-data-col")).toContainText("placa");

  await page.getByTestId("filter-trigger-local").click();
  await page.getByTestId("filter-pin-local").click();

  await expect(page.locator("thead .sheet-pinned-data-col")).toContainText("local");
  await expect(page.locator("thead .sheet-pinned-data-col")).not.toContainText("placa");
  await expect
    .poll(async () => {
      const headers = await page.locator("thead th").evaluateAll((cells) =>
        cells.map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "")
      );
      return headers[1] ?? "";
    })
    .toContain("local");

  await page.getByTestId("filter-hide-column-local").click();
  await expect(page.getByTestId("filter-trigger-local")).toHaveCount(0);

  await expect(page.getByTestId("action-hidden-columns")).toBeVisible();
  await page.getByTestId("action-hidden-columns").click();
  await expect(page.getByTestId("hidden-columns-dialog")).toBeVisible();
  await expect(page.getByTestId("hidden-columns-option-local")).toBeVisible();
  await page.getByTestId("hidden-columns-option-local").click();

  await expect(page.getByTestId("filter-trigger-local")).toBeVisible();
});

test("modo conferencia marca linha localmente com confirmacao", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("mode-toggle-conference").click();
  await expect(page.getByText("Conferida")).toBeVisible();
  await page.getByTestId("action-selection-dialog").click();
  await expect(page.getByTestId("selection-option-conference-mark")).toContainText("Marcar visiveis");
  await page.getByTestId("selection-dialog-close").click();

  await Promise.all([
    page.waitForEvent("dialog").then((dialog) => dialog.accept()),
    page.getByTestId("cell-carros-0-placa").click()
  ]);

  await expect(page.locator("tbody tr").first()).toHaveClass(/is-conference-row/);
  await expect(page.locator("tbody tr").first()).toHaveClass(/is-selected-row/);
  await expect(page.getByTestId("conference-cell-car-1")).toContainText("Conferida");
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("grid:v1:carros:conference") ?? ""))
    .toContain("car-1");

  await page.getByTestId("row-check-car-2").click();
  await page.getByTestId("action-selection-dialog").click();
  await expect(page.getByTestId("selection-option-conference-mark")).toContainText("Marcar selecoes");
  await page.getByTestId("selection-dialog-close").click();

  await Promise.all([
    page.waitForEvent("dialog").then((dialog) => dialog.accept()),
    page.getByTestId("cell-carros-0-placa").click()
  ]);

  await expect(page.locator("tbody tr").first()).not.toHaveClass(/is-conference-row/);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("grid:v1:carros:conference") ?? "[]"))
    .not.toContain("car-1");
});

test("modo editor abre handler de update e integra conferencia no formulario", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("mode-toggle-conference").click();
  await page.getByTestId("mode-toggle-editor").click();

  await page.getByTestId("cell-carros-1-placa").click();
  await expect(page.getByTestId("form-topbar")).toContainText("Editar CARROS: XYZ9988");
  await expect(page.getByTestId("form-topbar")).toContainText("Corolla XEi 2023 28.000 KM");
  await expect(page.getByTestId("form-delete")).toBeVisible();
  await expect(page.getByTestId("form-finalize")).toBeVisible();
  await expect(page.getByTestId("form-conference-toggle")).toContainText("Marcar");

  await page.getByTestId("form-conference-toggle").click();

  await expect(page.getByTestId("conference-cell-car-2")).toContainText("Conferida");
  await expect(page.locator("tbody tr").nth(1)).toHaveClass(/is-conference-row/);

  await page.getByTestId("conference-cell-car-2").click();
  await expect(page.getByTestId("form-topbar")).toContainText("Editar CARROS: XYZ9988");
  await expect(page.getByTestId("form-topbar")).toContainText("Corolla XEi 2023 28.000 KM");
});

test("registra venda pelo dialog do formulario de carros", async ({ page }) => {
  let vendaPayload: Record<string, unknown> | null = null;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/v1/vendas")) {
      vendaPayload = request.postDataJSON() as Record<string, unknown>;
    }
  });

  await openApp(page);

  await page.getByTestId("mode-toggle-editor").click();
  await page.getByTestId("cell-carros-1-placa").click();
  await page.getByTestId("form-finalize").click();

  await expect(page.getByTestId("venda-dialog")).toBeVisible();
  await page.getByTestId("venda-dialog-forma-pagamento").selectOption("financiado");
  await page.getByTestId("venda-dialog-valor-total").fill("126.500,00");
  await page.getByTestId("venda-dialog-valor-entrada").fill("10.000,00");
  await page.getByTestId("venda-dialog-comprador-nome").fill("Cliente QA");
  await page.getByTestId("venda-dialog-submit").click();

  await expect(page.getByTestId("venda-dialog")).toHaveCount(0);
  await expect(page.getByTestId("form-info")).toContainText("Venda registrada");
  await expect.poll(() => vendaPayload).toMatchObject({
    carro_id: "car-2",
    vendedor_auth_user_id: DEV_ACTOR_AUTH_USER_IDS.ADMINISTRADOR,
    forma_pagamento: "financiado",
    valor_total: 126500,
    valor_entrada: 10000,
    comprador_nome: "Cliente QA"
  });
});

test("ciclo de selecionar tudo alterna entre inverter e limpar", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("row-check-car-1")).toBeVisible();
  await expect(page.getByTestId("row-check-car-2")).toBeVisible();

  await page.getByTestId("row-check-car-1").click();
  await expect(page.getByTestId("row-check-car-1")).toBeChecked();
  await expect(page.getByTestId("row-check-car-2")).not.toBeChecked();

  await page.getByTestId("action-select-cycle").click();
  await expect(page.getByTestId("row-check-car-1")).not.toBeChecked();
  await expect(page.getByTestId("row-check-car-2")).toBeChecked();

  await page.getByTestId("action-select-cycle").click();
  await expect(page.getByTestId("row-check-car-1")).not.toBeChecked();
  await expect(page.getByTestId("row-check-car-2")).not.toBeChecked();

  await page.getByTestId("action-select-cycle").click();
  await expect(page.getByTestId("row-check-car-1")).toBeChecked();
  await expect(page.getByTestId("row-check-car-2")).toBeChecked();
});

test("shift + setas expande selecao para multiplas celulas", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("cell-carros-0-id")).toBeVisible();

  await page.getByTestId("cell-carros-0-id").click();
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Shift");

  const selectedCount = await page.evaluate(() => document.querySelectorAll("td.is-selected-cell").length);
  expect(selectedCount).toBeGreaterThan(2);
});

test("grid bloqueia selecao nativa de texto durante selecao de celulas", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("cell-carros-0-id").click();
  await page.keyboard.down("Shift");
  await page.getByTestId("cell-carros-1-placa").click();
  await page.keyboard.up("Shift");

  const selectionState = await page.evaluate(() => {
    const cell = document.querySelector('[data-testid="cell-carros-0-id"]') as HTMLElement | null;
    return {
      selectedText: window.getSelection()?.toString() ?? "",
      userSelect: cell ? window.getComputedStyle(cell).userSelect : ""
    };
  });

  expect(selectionState.selectedText).toBe("");
  expect(selectionState.userSelect).toBe("none");
});

test("ctrl+c copia selecao em formato csv", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("cell-carros-0-id")).toBeVisible();

  await page.getByTestId("cell-carros-0-id").click();
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Shift");

  await page.keyboard.press("Control+c");
  const clipboard = await page.evaluate(async () => navigator.clipboard.readText());
  expect(clipboard).toContain("car-1,ABC1234");
  expect(clipboard).toContain("car-2,XYZ9988");
});

test("restaura configuracao de pagina salvo por grid", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("grid:v1:carros:page", JSON.stringify({ page: 1, pageSize: 50 }));
  });

  await openApp(page);

  await expect(page.locator(".sheet-pager-status")).toContainText("1/1");
  await expect(page.locator(".sheet-pager-top select")).toHaveValue("50");
});

test("restaura scroll horizontal e vertical salvo por grid", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");

  const savedScroll = await page.getByTestId("sheet-grid-container").evaluate((node) => {
    const element = node as HTMLElement;
    element.style.height = "56px";
    element.scrollLeft = 240;
    element.scrollTop = 40;
    element.dispatchEvent(new Event("scroll"));

    return {
      left: Math.round(element.scrollLeft),
      top: Math.round(element.scrollTop),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    };
  });

  expect(savedScroll.scrollWidth).toBeGreaterThan(savedScroll.clientWidth);
  expect(savedScroll.scrollHeight).toBeGreaterThan(savedScroll.clientHeight);
  expect(savedScroll.left).toBeGreaterThan(0);
  expect(savedScroll.top).toBeGreaterThan(0);

  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(window.localStorage.getItem("grid:v1:carros:scroll") ?? '{"left":0,"top":0}').left as number)
    )
    .toBe(savedScroll.left);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(window.localStorage.getItem("grid:v1:carros:scroll") ?? '{"left":0,"top":0}').top as number)
    )
    .toBe(savedScroll.top);

  await switchSheet(page, "modelos", "Civic Touring");

  await switchSheet(page, "carros", "ABC1234");

  await expect.poll(() => page.getByTestId("sheet-grid-container").evaluate((node) => Math.round((node as HTMLElement).scrollLeft))).toBe(
    savedScroll.left
  );
  await expect.poll(() => page.getByTestId("sheet-grid-container").evaluate((node) => Math.round((node as HTMLElement).scrollTop))).toBe(
    savedScroll.top
  );
});

test("clampa o scroll salvo quando a sheet nao possui area suficiente para rolar", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("grid:v1:modelos:scroll", JSON.stringify({ left: 240, top: 90 }));
  });

  await openApp(page);

  await switchSheet(page, "modelos", "Civic Touring");

  await expect.poll(() => page.getByTestId("sheet-grid-container").evaluate((node) => Math.round((node as HTMLElement).scrollLeft))).toBe(0);
  await expect.poll(() => page.getByTestId("sheet-grid-container").evaluate((node) => Math.round((node as HTMLElement).scrollTop))).toBe(0);
});

test("expande grupos repetidos como linhas filhas compactas do grid", async ({ page }) => {
  await openApp(page);

  await switchSheet(page, "grupos_repetidos", "grp-1");

  await page.getByTestId("expand-group-grp-1").click();

  await expect(page.getByTestId("group-child-row-grp-1-car-1")).toContainText("ABC1234");
  await expect(page.getByTestId("group-child-row-grp-1-car-1")).toContainText("Carro QA 1");
  await expect(page.getByTestId("group-child-row-grp-1-car-1")).toContainText("Referencia");
  await expect(page.getByTestId("group-child-row-grp-1-car-2")).toContainText("XYZ9988");
  await expect(page.locator(".sheet-child-grid")).toHaveCount(0);
});

test("resize de coluna respeita limites minimo e maximo", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");

  const widthBefore = await page.evaluate(() => {
    const col = document.querySelector(".sheet-grid colgroup col:nth-child(3)") as HTMLTableColElement | null;
    return col ? Number.parseFloat(col.style.width || "0") : 0;
  });

  const handle = page.getByTestId("resize-handle-placa");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Resize handle da coluna 'placa' nao encontrado.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 320, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  const widthAfterShrink = await page.evaluate(() => {
    const col = document.querySelector(".sheet-grid colgroup col:nth-child(3)") as HTMLTableColElement | null;
    return col ? Number.parseFloat(col.style.width || "0") : 0;
  });

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 520, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  const widthAfterGrow = await page.evaluate(() => {
    const col = document.querySelector(".sheet-grid colgroup col:nth-child(3)") as HTMLTableColElement | null;
    return col ? Number.parseFloat(col.style.width || "0") : 0;
  });

  expect(widthAfterShrink).toBeLessThanOrEqual(widthBefore);
  expect(widthAfterShrink).toBeGreaterThanOrEqual(20);
  expect(widthAfterGrow).toBeGreaterThanOrEqual(widthAfterShrink);
  expect(widthAfterGrow).toBeLessThanOrEqual(widthBefore);
});

test("navegacao por setas percorre multiplas celulas sem travar", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");

  const firstCell = page.getByTestId("cell-carros-0-id");
  await firstCell.click();

  const selectedCell = page.locator("td.is-selected-cell").first();
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-id");

  await page.keyboard.press("ArrowRight");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-placa");

  await page.keyboard.press("ArrowRight");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-nome");

  await page.keyboard.press("ArrowRight");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-modelo_id");

  await page.keyboard.press("ArrowRight");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-local");

  await page.keyboard.press("ArrowDown");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-1-local");
});

test("edicao inline persiste apos recarga", async ({ page }) => {
  await openApp(page);
  await switchSheet(page, "modelos", "Civic Touring");

  const cell = page.getByTestId("cell-modelos-0-modelo");
  await cell.dblclick();

  const editor = page.locator(".sheet-inline-editor");
  await editor.fill("Civic Touring QA");
  await editor.press("Enter");

  await expect(page.getByTestId("cell-modelos-0-modelo")).toContainText("Civic Touring QA");

  await page.getByTestId("action-reload").click();
  await expect(page.getByTestId("cell-modelos-0-modelo")).toContainText("Civic Touring QA");
});

test("insere e remove linha na planilha de modelos", async ({ page }) => {
  await openApp(page);
  await switchSheet(page, "modelos", "Civic Touring");

  await page.getByTestId("action-insert-row").click();
  await expect(page.getByTestId("sheet-form-panel")).toBeVisible();
  await page.getByTestId("form-field-modelo").fill("NOVO MODELO QA");
  await page.getByTestId("form-submit").click();

  const novaLinha = page.locator("tbody tr", { hasText: "NOVO MODELO QA" }).first();
  await expect(novaLinha).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());

  await novaLinha.locator('input[type="checkbox"]').click();
  await page.getByTestId("action-delete-rows").click();

  await expect(page.locator("tbody tr", { hasText: "NOVO MODELO QA" })).toHaveCount(0);
});

test("aplica alteracao em massa em uma coluna das linhas selecionadas", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("row-check-car-1").click();
  await page.getByTestId("row-check-car-2").click();
  await page.getByTestId("action-mass-update").click();

  await expect(page.getByTestId("mass-update-dialog")).toBeVisible();
  await page.getByTestId("mass-update-column").selectOption("cor");
  await page.getByTestId("mass-update-value").selectOption("azul");
  await page.getByTestId("mass-update-submit").click();

  await expect(page.getByTestId("mass-update-dialog")).toHaveCount(0);
  await expect(page.getByTestId("cell-carros-0-cor")).toContainText("azul");
  await expect(page.getByTestId("cell-carros-1-cor")).toContainText("azul");
});

test("gera html de impressao com secoes tratadas e outros", async ({ page }) => {
  await installPrintCapture(page);

  await openApp(page);

  await page.getByTestId("action-print-table").click();
  await expect(page.getByTestId("print-dialog")).toBeVisible();
  await page.getByTestId("print-title").fill("Tabela QA");
  await page.getByTestId("print-columns-clear").click();
  await page.getByTestId("print-columns-select-all").click();
  await page.getByTestId("print-sort-column").selectOption("placa");
  await page.getByTestId("print-sort-direction").selectOption("desc");
  await page.getByTestId("print-section-column").selectOption("local");
  await page.getByTestId("print-sections-clear").click();
  await page.getByTestId("print-sections-select-all").click();
  await page.getByTestId("print-section-toggle-loja_norte").uncheck();
  await page.getByTestId("print-submit").click();

  await expect(page.getByTestId("print-dialog")).toHaveCount(0);
  await page.waitForFunction(() => {
    return (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed;
  });

  const capture = await page.evaluate(() => (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture);
  expect(capture.printed).toBe(true);
  expect(capture.html).toContain("Tabela QA");
  expect(capture.html).toMatch(/\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}/);
  expect(capture.html).toMatch(
    /<div class="print-meta-badges">\s*<span class="print-meta-badge">\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}<\/span>/
  );
  expect(capture.html).toContain("Total de veiculos: 3");
  expect(capture.html).toContain("Total de veiculos: 1");
  expect(capture.html).toContain("Ordenado por placa (decrescente)");
  expect(capture.html).toContain("loja_centro");
  expect(capture.html).toContain("Outros");
  expect(capture.html).toContain("@page { margin: 4mm; }");
  expect(capture.html).toContain("padding: 6px 0 0 6px;");
  expect(capture.html).toContain("font-size: 12px;");
  expect(capture.html).toContain("break-inside: avoid-page;");
});

test("impressao aplica cor do indice diretamente no fundo da celula", async ({ page }) => {
  await installPrintCapture(page);
  await openApp(page);

  await page.getByTestId("action-print-table").click();
  await expect(page.getByTestId("print-dialog")).toBeVisible();

  await page.getByTestId("print-highlight-add").click();
  await page.getByTestId("print-highlight-column-0").selectOption("placa");
  await page.getByTestId("print-highlight-label-0").fill("Placa alvo");
  await page.getByTestId("print-highlight-values-0").fill("ABC1234");
  await page.getByTestId("print-highlight-color-0").fill("#ff0000");
  await page.getByTestId("print-submit").click();

  await expect(page.getByTestId("print-dialog")).toHaveCount(0);
  await page.waitForFunction(() => {
    return (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed;
  });

  const capture = await page.evaluate(() => (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture);
  expect(capture.html).toContain('class="print-highlight-swatch" style="--swatch-color: #ffb3b3; background: #ffb3b3 !important; border-color: #ffb3b3 !important;"');
  expect(capture.html).toContain("box-shadow: inset 0 0 0 100vmax var(--swatch-color) !important;");
  expect(capture.html).toContain("background-color: #ffb3b3 !important");
  expect(capture.html).not.toContain("print-highlight-layer");
});

test("botao global imprime preset de carros sem depender da sheet atual", async ({ page }) => {
  await installPrintCapture(page);
  await openApp(page);

  await switchSheet(page, "modelos", "Civic Touring");

  await page.getByTestId("global-print-carros").click();
  await page.waitForFunction(() => {
    return (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed;
  });

  const capture = await page.evaluate(() => (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture);
  expect(capture.html).toContain("CARROS");
  expect(capture.html).toContain("Modelo");
  expect(capture.html).toContain("Fabr.");
  expect(capture.html).toContain("KM");
  expect(capture.html).toContain("Total de veiculos: 3");
  expect(capture.html).toContain("Ordenado por Preço (crescente)");
  expect(capture.html).toContain("Civic Touring");
  expect(capture.html).toContain("Loja 1");
  expect(capture.html).toContain("Loja 2");
  expect(capture.html).toContain("Loja 3");
});

test("insere em massa no side direito com separador configuravel", async ({ page }) => {
  await openApp(page);
  await switchSheet(page, "modelos", "Civic Touring");

  await page.getByTestId("action-insert-bulk").click();
  await expect(page.getByTestId("sheet-form-panel")).toBeVisible();
  await expect(page.getByTestId("bulk-topbar")).toContainText("Insert em massa");
  await expect(page.getByTestId("bulk-input")).toBeFocused();

  await page.getByTestId("bulk-separator").selectOption(";");
  await page.getByTestId("bulk-input").fill("MODELO QA L1\nMODELO QA L2");
  await page.getByTestId("bulk-submit").click();

  await expect(page.getByTestId("bulk-success")).toContainText("2 linha(s) inserida(s)");
  await expect(page.locator("tbody tr", { hasText: "MODELO QA L1" })).toHaveCount(1);
  await expect(page.locator("tbody tr", { hasText: "MODELO QA L2" })).toHaveCount(1);
});

test("insere carros em massa com csv de virgula e labels visiveis", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("action-insert-bulk").click();
  await expect(page.getByTestId("bulk-topbar")).toContainText("Insert em massa");

  await page
    .getByTestId("bulk-input")
    .fill("QAA1A11,Carro CSV,mod-1,Loja 2,DISPONÍVEL,ANUNCIADO,Preparação,sim,Prata,2024,2025,12000,99990");
  await page.getByTestId("bulk-submit").click();

  await expect(page.getByTestId("bulk-success")).toContainText("1 linha(s) inserida(s)");

  const novaLinha = page.locator("tbody tr", { hasText: "QAA1A11" }).first();
  await expect(novaLinha).toContainText("loja_norte");
  await expect(novaLinha).toContainText("disponivel");
  await expect(novaLinha).toContainText("publicado");
  await expect(novaLinha).toContainText("preparacao");
  await expect(novaLinha).toContainText("Sim");
});

test("finaliza carro selecionado e atualiza estado logico", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("row-check-car-1").click();
  await page.getByTestId("action-finalize-rows").click();

  await expect(page.getByText("Nao")).toBeVisible();
  await expect(page.getByText("vendido")).toBeVisible();
});

test("executa rebuild de repetidos pela sheet", async ({ page }) => {
  await openApp(page);
  await switchSheet(page, "grupos_repetidos", "grp-1");

  await page.getByTestId("action-rebuild-repetidos").click();
  await expect(page.getByTestId("sheet-grid-table")).toContainText("grp-rebuild");
});

test("executa upload em massa real com BULK_UPLOAD_MASS", async ({ page }) => {
  test.skip(!LIVE_TEST_ENABLED, "Defina E2E_LIVE=1 para executar o teste live do upload em massa.");
  test.setTimeout(180_000);

  await useLiveApiRoutes(page);
  await cleanupBulkUploadMassRows();

  try {
    await openAppWithSavedCredentials(page);
    await expect(page.getByTestId("action-insert-bulk")).toBeEnabled();

    await page.getByTestId("action-insert-bulk").click();
    await expect(page.getByTestId("bulk-topbar")).toContainText("Insert em massa");
    await page.getByTestId("bulk-input").fill(BULK_UPLOAD_MASS.join("\n"));
    await page.getByTestId("bulk-submit").click();

    await expect(page.getByTestId("bulk-success")).toContainText(`${BULK_UPLOAD_MASS.length} linha(s) inserida(s)`, {
      timeout: 120_000
    });
    await expect.poll(countBulkUploadMassRows, { timeout: 30_000 }).toBe(BULK_UPLOAD_MASS.length);
  } finally {
    await cleanupBulkUploadMassRows();
  }
});
