import type { Page, Route } from "@playwright/test";
import { buildDevActor, type DevRole } from "./auth";

const ok = (data: unknown) => ({ data, meta: { request_id: "e2e" } });

type Matcher = [RegExp, unknown];

// Shape esperado por holistic-sheet.tsx em useMemo[lookupOptionsByColumn].
// Todas as chaves precisam existir como array para evitar `.map` de undefined.
const EMPTY_LOOKUPS_PAYLOAD = {
  sale_statuses: [],
  announcement_statuses: [],
  locations: [],
  vehicle_states: [],
  canais_cliente: [],
  tipos_processo: [],
  propositos: [],
  estados_pericia: [],
  estados_chave_reserva: [],
  estados_transferencia: [],
  user_roles: [],
  user_statuses: [],
  usuarios: []
};

// Shape esperado por components/admin/api.ts → fetchAdminUsers.
const EMPTY_ADMIN_USERS_PAYLOAD = {
  users: [],
  lookups: {
    roles: [],
    statuses: []
  }
};

function defaultMatchers(actor: ReturnType<typeof buildDevActor>): Matcher[] {
  return [
    [/\/api\/v1\/me(?:\?|$)/, actor],
    [/\/api\/v1\/lookups/, EMPTY_LOOKUPS_PAYLOAD],
    [/\/api\/v1\/insights\/summary/, { byTable: {} }],
    [/\/api\/v1\/insights\/anuncios\/missing-rows/, { rows: [] }],
    [/\/api\/v1\/grid\/[^/]+\/facets/, { table: "", column: "", options: [] }],
    [/\/api\/v1\/grid\/[^/]+(?:\?|$)/, { rows: [], total: 0, page: 1, pageSize: 50 }],
    [/\/api\/v1\/auditoria\/dashboard/, { entries: [], summary: {} }],
    [/\/api\/v1\/auditoria(?:\?|$)/, { entries: [], total: 0, page: 1, pageSize: 25 }],
    [/\/api\/v1\/files\/folders\/[^/]+\/files/, { files: [] }],
    [
      /\/api\/v1\/files\/folders\/[^/]+(?:\?|$)/,
      { folder: null, breadcrumb: [], childFolders: [], files: [] }
    ],
    [/\/api\/v1\/files\/folders(?:\?|$)/, { folders: [] }],
    [/\/api\/v1\/files\/automation-config/, { configs: [] }],
    [/\/api\/v1\/admin\/users/, EMPTY_ADMIN_USERS_PAYLOAD],
    [/\/api\/v1\/vendas/, { vendas: [], total: 0 }],
    [/\/api\/v1\/price-contexts\/latest/, { context: null }],
    [/\/api\/v1\/price-contexts(?:\?|$)/, { rows: [], total: 0, page: 1, pageSize: 50 }],
    [/\/api\/v1\/modelos/, { modelos: [], total: 0 }],
    [/\/api\/v1\/anuncios\/[^/]+\/insights/, { insights: [] }],
    [/\/api\/v1\/anuncios(?:\?|$)/, { anuncios: [], total: 0 }],
    [/\/api\/v1\/carros\/consulta-placa/, { carro: null }],
    [/\/api\/v1\/carros(?:\?|$)/, { carros: [], total: 0 }]
  ];
}

export type InstallApiMocksOptions = {
  role?: DevRole;
  overrides?: Matcher[];
};

export async function installApiMocks(page: Page, options: InstallApiMocksOptions = {}) {
  const role = options.role ?? "ADMINISTRADOR";
  const actor = buildDevActor(role);
  const matchers = [...(options.overrides ?? []), ...defaultMatchers(actor)];

  await page.route("**/api/v1/**", async (route: Route) => {
    const url = route.request().url();
    for (const [re, data] of matchers) {
      if (re.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(data))
        });
        return;
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ok({}))
    });
  });
}
