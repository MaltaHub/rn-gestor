import { expect, test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { LOOKUPS_WITH_DATA } from "../helpers/fixtures";

test.describe.configure({ timeout: 120_000 });

// Payload de grid completo (com header) para as linhas realmente carregarem.
const CARROS_GRID = {
  table: "carros",
  header: ["id", "placa", "modelo_id", "estado_venda", "em_estoque", "info_confirmada"],
  formColumns: ["placa", "modelo_id"],
  rows: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      placa: "ABC1A23",
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

test("botão Insights: fila por problema e pesquisa por placa levam até a linha", async ({ page }) => {
  await installApiMocks(page, {
    overrides: [
      [/\/api\/v1\/lookups/, LOOKUPS_WITH_DATA],
      [/\/api\/v1\/grid\/carros(?:\?|$)/, CARROS_GRID]
    ]
  });
  await signInAsDevRole(page, "ADMINISTRADOR", { next: "/" });
  await page.getByTestId("holistic-sheet").waitFor({ state: "visible", timeout: 30_000 });

  // Um botão só (aparece quando há ocorrência, com a contagem).
  const trigger = page.getByTestId("action-open-insights");
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("Insights");

  // FILA: um card por problema, com a quantidade e o caso da vez.
  await trigger.click();
  const dialog = page.getByTestId("insights-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId("insights-mode-fila").click();
  const card = page.getByTestId("insight-compliance_carros");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("insight-count-compliance_carros")).toHaveText("1");
  await expect(card).toContainText("ABC1A23");

  // Última etapa: leva até a linha (fecha o painel e seleciona a linha).
  await page.getByTestId("insight-go-compliance_carros").click();
  await expect(dialog).toHaveCount(0);
  const row = page.locator(`tr[data-row-id="${CARROS_GRID.rows[0].id}"]`);
  await expect(row).toHaveClass(/is-selected-row/);

  // PESQUISA: placa → insights da placa → linha.
  await trigger.click();
  await page.getByTestId("insights-mode-pesquisa").click();
  await page.getByTestId("insights-search").fill("abc1");
  await page.getByTestId("insights-plate-ABC1A23").click();
  await expect(page.getByTestId("insights-plate-item-compliance_carros")).toContainText("Veículo não confirmado");
  await expect(page.getByTestId("insights-search")).toHaveCount(0);
  await page.getByTestId("insights-plate-item-compliance_carros").click();
  await expect(dialog).toHaveCount(0);

  // Busca sem ocorrência não mostra placa nenhuma.
  await trigger.click();
  await page.getByTestId("insights-search").fill("ZZZ");
  await expect(page.locator("[data-testid^=\"insights-plate-\"]")).toHaveCount(0);

  // Selecionar todas as linhas do problema (ações em massa).
  await page.getByTestId("insights-mode-fila").click();
  await page.getByTestId("insight-select-compliance_carros").click();
  await expect(dialog).toHaveCount(0);
});
