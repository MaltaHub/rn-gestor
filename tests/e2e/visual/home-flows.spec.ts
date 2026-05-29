import { test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { CARROS_FIXTURE, LOOKUPS_WITH_DATA } from "../helpers/fixtures";
import { expectStableScreenshot, VISUAL_VIEWPORT } from "../helpers/visual";

test.use({ viewport: VISUAL_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

test.describe("visual flows / home (ui-grid)", () => {
  test("01 - tabela com dados", async ({ page }) => {
    await installApiMocks(page, {
      overrides: [
        [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
        [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_FIXTURE]
      ]
    });
    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
    await page.getByTestId("holistic-sheet").waitFor({ state: "visible" });
    await page
      .getByTestId(`cell-carros-0-placa`)
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {
        /* cell pode usar id em vez de índice; segue se não aparecer */
      });
    await expectStableScreenshot(page, "home-01-com-dados.png");
  });

  test("02 - busca preenchida na toolbar", async ({ page }) => {
    await installApiMocks(page, {
      overrides: [
        [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
        [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_FIXTURE]
      ]
    });
    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
    await page.getByTestId("holistic-sheet").waitFor({ state: "visible" });
    const searchInput = page.getByPlaceholder("Buscar...").first();
    await searchInput.waitFor({ state: "visible", timeout: 10_000 });
    await searchInput.fill("ABC");
    // Tira o foco do input para o screenshot ficar consistente (sem caret).
    await page.keyboard.press("Tab");
    await expectStableScreenshot(page, "home-02-busca-preenchida.png");
  });

  test("03 - sidebar aberta (lista de tabelas)", async ({ page }) => {
    await installApiMocks(page, {
      overrides: [
        [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
        [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_FIXTURE]
      ]
    });
    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
    await page.getByTestId("holistic-sheet").waitFor({ state: "visible" });
    const toggle = page.getByTestId("sidebar-toggle");
    await toggle.waitFor({ state: "visible", timeout: 10_000 });
    await toggle.click();
    await page.getByTestId("sheet-sidebar").waitFor({ state: "visible" });
    await expectStableScreenshot(page, "home-03-sidebar-aberta.png");
  });
});
