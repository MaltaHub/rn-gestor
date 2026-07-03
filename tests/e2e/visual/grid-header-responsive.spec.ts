import { expect, test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { LOOKUPS_WITH_DATA } from "../helpers/fixtures";

test.describe.configure({ timeout: 150_000 });

const HEADER = ["id", "placa", "nome", "modelo_id", "local", "estado_venda", "em_estoque"];
const rows = Array.from({ length: 6 }, (_, i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i + 10)}`,
  placa: `ABC${1000 + i}`,
  nome: `Veículo ${i + 1}`,
  modelo_id: "11111111-1111-4111-8111-111111111101",
  local: "Pátio",
  estado_venda: "DISPONÍVEL",
  em_estoque: true
}));
const CARROS_GRID = { table: "carros", header: HEADER, formColumns: ["placa"], rows, total: rows.length, page: 1, pageSize: 50 };

async function boot(page: import("@playwright/test").Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await installApiMocks(page, {
    overrides: [
      [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
      [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_GRID]
    ]
  });
  await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
  await page.getByTestId("holistic-sheet").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("action-hide-toggle").waitFor({ state: "visible", timeout: 15_000 });
}

async function rowsY(page: import("@playwright/test").Page) {
  const pager = await page.locator(".sheet-topbar-head .sheet-pager-top").boundingBox();
  const toolbox = await page.locator(".sheet-topbar-head .sheet-toolbar-compact").boundingBox();
  if (!pager || !toolbox) throw new Error("topbar não medível");
  return { pager, toolbox };
}

test("header do grid: 2 faixas no tablet (toolbox abaixo da paginação)", async ({ page }) => {
  await boot(page, 768, 1024);
  const { pager, toolbox } = await rowsY(page);
  // A toolbox fica numa faixa ABAIXO da paginação (nao espremida ao lado do titulo).
  expect(toolbox.y).toBeGreaterThan(pager.y + pager.height - 4);
  // Envelope/Post-it viraram icones (mesma altura dos demais icones da toolbox).
  const env = await page.getByTestId("shortcut-envelope").boundingBox();
  expect(env && env.height < 44).toBeTruthy();
});

test("header do grid: 1 faixa no desktop (toolbox e paginação na mesma linha)", async ({ page }) => {
  await boot(page, 1280, 800);
  const { pager, toolbox } = await rowsY(page);
  expect(Math.abs(toolbox.y - pager.y)).toBeLessThanOrEqual(24);
});
