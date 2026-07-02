import { expect, test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { LOOKUPS_WITH_DATA } from "../helpers/fixtures";

test.describe.configure({ timeout: 120_000 });

// Payload de grid completo (com header) para as linhas realmente carregarem.
const CARROS_GRID = {
  table: "carros",
  header: ["id", "placa", "nome", "modelo_id", "estado_venda", "em_estoque", "info_confirmada"],
  formColumns: ["placa", "nome", "modelo_id"],
  rows: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      placa: "ABC1A23",
      nome: "Onix LT",
      modelo_id: "11111111-1111-4111-8111-111111111101",
      estado_venda: "DISPONÍVEL",
      em_estoque: true,
      info_confirmada: false
    }
  ],
  total: 1,
  page: 1,
  pageSize: 50
};

test("botão INSIGHTS abre o pop-up com os insights da tabela", async ({ page }) => {
  await installApiMocks(page, {
    overrides: [
      [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
      [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_GRID]
    ]
  });
  await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
  await page.getByTestId("holistic-sheet").waitFor({ state: "visible", timeout: 30_000 });

  // O botão fica no status-row, ao lado de "Fila persistencia".
  const trigger = page.getByTestId("action-open-insights");
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("INSIGHTS");

  await trigger.click();
  const dialog = page.getByTestId("insights-dialog");
  await expect(dialog).toBeVisible();
  // Carro não confirmado -> card de compliance com ação de selecionar.
  await expect(page.getByTestId("insight-compliance")).toBeVisible();
  await expect(page.getByTestId("insight-select-compliance")).toBeVisible();

  await page.screenshot({ path: "mobile-audit/grid-insights.png" });

  // Selecionar a partir do insight seleciona a linha e fecha o pop-up.
  await page.getByTestId("insight-select-compliance").click();
  await expect(dialog).toHaveCount(0);
});
