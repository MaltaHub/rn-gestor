import { expect, test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { CARROS_FIXTURE, LOOKUPS_WITH_DATA } from "../helpers/fixtures";

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ timeout: 120_000 });

// Smoke do chrome do grid no mobile: renderiza sem quebrar e a busca fica em
// linha CHEIA (mais larga que os icones de modo) — nao mais espalhada no grid.
test("mobile: grid renderiza e a busca ocupa a linha cheia", async ({ page }) => {
  await installApiMocks(page, {
    overrides: [
      [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
      [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_FIXTURE]
    ]
  });
  await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
  await page.getByTestId("holistic-sheet").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("action-hide-toggle").waitFor({ state: "visible", timeout: 15_000 });

  const searchField = page.locator(".sheet-toolbar-search-field");
  const sidePanelIcon = page.getByTestId("action-open-secondary-grid");
  await expect(searchField).toBeVisible();
  const searchBox = await searchField.boundingBox();
  const iconBox = await sidePanelIcon.boundingBox();
  // Busca em linha cheia => bem mais larga que um icone de 40px.
  expect(searchBox && iconBox && searchBox.width > iconBox.width * 3).toBeTruthy();
});
