import { test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { FOLDERS_FIXTURE, FOLDER_DETAIL_FIXTURE } from "../helpers/fixtures";
import { expectStableScreenshot, VISUAL_VIEWPORT } from "../helpers/visual";

test.use({ viewport: VISUAL_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

test.describe("visual flows / arquivos", () => {
  test("01 - listagem com pastas", async ({ page }) => {
    await installApiMocks(page, {
      overrides: [
        [/\/api\/v1\/files\/folders\/[^/]+(?:\?|$)/, FOLDER_DETAIL_FIXTURE],
        [/\/api\/v1\/files\/folders(?:\?|$)/, FOLDERS_FIXTURE]
      ]
    });
    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/arquivos" });
    await page
      .getByText("Documentos", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    await expectStableScreenshot(page, "arquivos-01-com-pastas.png");
  });

  test("02 - form de nova pasta aberto", async ({ page }) => {
    await installApiMocks(page, {
      overrides: [
        [/\/api\/v1\/files\/folders\/[^/]+(?:\?|$)/, FOLDER_DETAIL_FIXTURE],
        [/\/api\/v1\/files\/folders(?:\?|$)/, FOLDERS_FIXTURE]
      ]
    });
    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/arquivos" });
    // O botão "Nova pasta" aparece tanto no toolbar quanto no empty state.
    // Pega o do toolbar (primeiro visível).
    const novaPastaBtn = page.getByRole("button", { name: "Nova pasta" }).first();
    await novaPastaBtn.waitFor({ state: "visible", timeout: 10_000 });
    await novaPastaBtn.click();
    // Aguarda algum campo do form aparecer.
    await page
      .getByPlaceholder(/nome.*pasta|pasta/i)
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {
        /* form pode ter outro placeholder; segue com screenshot mesmo assim */
      });
    await expectStableScreenshot(page, "arquivos-02-nova-pasta-aberta.png");
  });
});
