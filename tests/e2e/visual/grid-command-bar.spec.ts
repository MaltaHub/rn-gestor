import { expect, test, type Page } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { LOOKUPS_WITH_DATA } from "../helpers/fixtures";

test.describe.configure({ timeout: 150_000 });

// Barra única do grid + cabeçalho do form (padrão da aba Arquivos): em toda
// largura nada sai cortado, a página não rola na horizontal e os menus "Mais"
// abrem inteiros dentro da tela.

const HEADER = ["id", "placa", "modelo_id", "local", "estado_venda", "em_estoque"];
const rows = Array.from({ length: 6 }, (_, i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i + 10)}`,
  placa: `ABC${1000 + i}`,
  modelo_id: "11111111-1111-4111-8111-111111111101",
  local: "Pátio",
  estado_venda: "DISPONÍVEL",
  em_estoque: true
}));
const CARROS_GRID = { table: "carros", header: HEADER, formColumns: ["placa"], rows, total: rows.length, page: 1, pageSize: 50 };

async function boot(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await installApiMocks(page, {
    overrides: [
      [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
      [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_GRID]
    ]
  });
  await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
  await page.getByTestId("grid-command-bar").waitFor({ state: "visible", timeout: 60_000 });
  await page.getByTestId("cell-carros-0-placa").waitFor({ state: "visible", timeout: 30_000 });
}

/** Elementos da barra que saem da tela + rolagem horizontal da página. */
async function measure(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const clipped = Array.from(root.querySelectorAll("button, label, select, strong"))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && (box.right > window.innerWidth + 1 || box.left < -1);
      })
      .map((el) => el.getAttribute("data-testid") ?? el.textContent?.trim());
    return { clipped, pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  }, selector);
}

async function expectMenuInside(page: Page) {
  const menu = page.locator("[role='menu']");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width + 1).toBeTruthy();
}

for (const [width, height] of [
  [1440, 900],
  [1024, 800],
  [390, 844]
] as const) {
  test(`barra do grid e cabeçalho do form cabem inteiros em ${width}px`, async ({ page }) => {
    await boot(page, width, height);

    // Ações da seleção só aparecem com linha selecionada.
    await expect(page.getByTestId("action-mass-update")).toHaveCount(0);
    await page.getByTestId("row-check-00000000-0000-4000-8000-000000000010").check();
    await expect(page.getByTestId("grid-selection-chip")).toContainText("1");
    // Desktop: ações da seleção à vista; celular apertado: elas vão para o "Mais".
    if (width > 720) await expect(page.getByTestId("action-mass-update")).toBeVisible();

    const bar = await measure(page, "[data-testid='grid-command-bar']");
    expect(bar?.clipped).toEqual([]);
    expect(bar?.pageOverflowX).toBe(false);
    // Cada barra fica numa LINHA só (nunca cresce para baixo).
    expect((await page.getByTestId("grid-command-bar").boundingBox())?.height ?? 99).toBeLessThanOrEqual(52);
    if (width > 720) expect((await page.getByTestId("grid-tools-bar").boundingBox())?.height ?? 99).toBeLessThanOrEqual(50);

    // Desktop: tudo à vista (duas barras). Celular: o resto mora no "Mais".
    if (width <= 720) {
      await page.getByTestId("action-more").click();
      await expectMenuInside(page);
      await expect(page.getByTestId("action-mass-update")).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(page.getByTestId("action-more")).toHaveCount(0);
      const tools = await measure(page, "[data-testid='grid-tools-bar']");
      expect(tools?.clipped).toEqual([]);
    }

    // Form: Salvar + fechar sempre visíveis; o resto mora no "Mais".
    await page.getByTestId("action-insert-row").click();
    await expect(page.getByTestId("form-topbar")).toBeVisible();
    const form = await measure(page, "[data-testid='form-topbar']");
    expect(form?.clipped).toEqual([]);
    await expect(page.getByTestId("form-submit")).toBeVisible();
    await expect(page.getByTestId("panel-close-form")).toBeVisible();
  });
}

test("gaveta de tabelas: lista compacta com filtro por nome", async ({ page }) => {
  await boot(page, 1280, 800);
  await page.getByTestId("sidebar-toggle").click();
  await expect(page.getByTestId("sidebar-close")).toBeVisible();

  // O topo da gaveta não fica atrás do cabeçalho do app. Mede no mesmo
  // instante e espera a animação de entrada terminar (o botão se move nela).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const button = document.querySelector("[data-testid='sidebar-close']");
        if (!button) return "sem botão";
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit?.closest("[data-testid='sidebar-close']") ? "ok" : `${hit?.tagName}.${String(hit?.className)}`;
      })
    )
    .toBe("ok");

  await page.getByTestId("sidebar-search").fill("model");
  await expect(page.getByTestId("sheet-tab-modelos")).toBeVisible();
  await expect(page.getByTestId("sheet-tab-carros")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sheet-sidebar-backdrop")).not.toHaveClass(/is-open/);
});
