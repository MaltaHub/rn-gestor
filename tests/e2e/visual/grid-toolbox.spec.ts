import { expect, test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { CARROS_FIXTURE, LOOKUPS_WITH_DATA } from "../helpers/fixtures";
import { VISUAL_VIEWPORT } from "../helpers/visual";

test.use({ viewport: VISUAL_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

// Garante o redesign da toolbox do grid: acoes viram ICONES na linha do titulo
// (entre titulo e paginacao) e o chip de perfil + Sair/Arquivos somem.
test("grid: toolbox de icones entre titulo e paginacao, sem chip de perfil/sair", async ({ page }) => {
  await installApiMocks(page, {
    overrides: [
      [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
      [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_FIXTURE]
    ]
  });
  await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
  await page.getByTestId("holistic-sheet").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("action-hide-toggle").waitFor({ state: "visible", timeout: 15_000 });

  // Acoes sao botoes-icone (sheet-icon-btn), nao mais botoes gigantes de texto.
  for (const id of [
    "action-hide-toggle",
    "action-insert-row",
    "action-mass-update",
    "action-compliance-select",
    "action-advanced",
    "action-print-table",
    "action-open-audit-dashboard",
    "action-delete-rows"
  ]) {
    await expect(page.getByTestId(id), `${id} deve ser icone`).toHaveClass(/sheet-icon-btn/);
  }

  // Chip de perfil + Sair removidos do topo do grid.
  await expect(page.locator(".sheet-session-chip")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sair" })).toHaveCount(0);

  // Toolbox e paginacao ficam na MESMA linha (dentro do .sheet-topbar-head).
  await expect(page.locator(".sheet-topbar-head .sheet-toolbar-compact")).toHaveCount(1);
  await expect(page.locator(".sheet-topbar-head .sheet-pager-top")).toHaveCount(1);

  // Modos (conferencia/editor) e abrir-lateral viraram ICONES na barra de busca.
  for (const id of ["mode-toggle-conference", "mode-toggle-editor", "action-open-secondary-grid"]) {
    await expect(page.getByTestId(id), `${id} deve ser icone`).toHaveClass(/sheet-icon-btn/);
  }
  // O header antigo do painel (sheet-panel-head) foi removido.
  await expect(page.locator(".sheet-grid-panel .sheet-panel-head")).toHaveCount(0);
  // Status (insights) fica dentro do grid-body, acima da busca.
  await expect(page.locator(".sheet-grid-body .sheet-status-row")).toHaveCount(1);
});
