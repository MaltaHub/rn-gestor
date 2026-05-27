import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAsDevRole } from "./helpers/auth";

// ---------------------------------------------------------------------------
// Mocks minimos pros endpoints do editor (sem fixtures pesadas pra esse spec).
// ---------------------------------------------------------------------------

const FIXED_DATE = "2026-05-25T12:00:00.000Z";
const ADMIN_USER_ID = "44444444-4444-4444-8444-444444444444";

type Captured = {
  flowPosts: Array<Record<string, unknown>>;
};

async function installRoutes(page: Page, captured: Captured) {
  const envelope = (data: unknown) =>
    JSON.stringify({ data, meta: { request_id: "e2e-editor-schema" } });

  await page.route("**/api/v1/editor-flows**", async (route: Route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    if (method === "GET" && /\/editor-flows(?:\?.*)?$/.test(url.pathname + url.search)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
      return;
    }
    if (method === "POST" && url.pathname.endsWith("/editor-flows")) {
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      captured.flowPosts.push(body);
      const created = {
        id: "flow-created-schema",
        title: String(body.title ?? "Sem titulo"),
        description: null,
        sheet_key: null,
        graph: body.graph ?? { nodes: [], edges: [] },
        created_by_user_id: ADMIN_USER_ID,
        created_at: FIXED_DATE,
        updated_at: FIXED_DATE
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope(created) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
  });

  await page.route("**/api/v1/editor-flow-runs**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope([])
    });
  });

  await page.route("**/api/v1/editor-variables**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope([])
    });
  });
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

test.describe("Editor schema + dynamic outputs", () => {
  test("Source CARROS ejeta coluna placa via '+' e payload persiste em dynamicOutputs", async ({ page }) => {
    const captured: Captured = { flowPosts: [] };
    await installRoutes(page, captured);

    page.on("dialog", async (dialog) => {
      if (dialog.type() === "prompt") await dialog.accept("Fluxo com ejecao");
      else await dialog.accept();
    });

    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/editor" });

    // Adiciona AllRowsSource pela paleta.
    await page.getByTestId("editor-add-AllRowsSource").click();
    const sourceNode = page.getByTestId("node-AllRowsSource");
    await expect(sourceNode).toBeVisible();

    // Clica no "+" do source (supportsColumnEject=true).
    const addBtn = sourceNode.locator(".editor-node-add-output").first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Popover aberto — escolhe coluna "placa" (default sheet=carros, popover
    // carrega colunas via getSheetSchema).
    const popover = page.getByTestId(/socket-add-popover-/);
    await expect(popover).toBeVisible();
    await page.getByTestId("socket-add-column-placa").click();
    await expect(popover).toBeHidden();

    // Novo handle dinamico apareceu no source (id=col_placa).
    await expect(sourceNode.locator('[data-testid^="handle-dyn-"]').first()).toBeVisible();

    // Salva como — payload deve conter dynamicOutputs em AllRowsSource.
    await page.getByTestId("editor-title-input").fill("Fluxo com ejecao");
    await page.getByTestId("editor-save-as").click();

    await expect.poll(() => captured.flowPosts.length).toBe(1);
    const posted = captured.flowPosts[0] as {
      graph: {
        nodes: Array<{ type: string; dynamicOutputs?: Array<{ id: string; fieldName?: string; kind: string }> }>;
      };
    };
    const sourceNodePayload = posted.graph.nodes.find((n) => n.type === "AllRowsSource");
    expect(sourceNodePayload?.dynamicOutputs).toBeDefined();
    const colDyno = sourceNodePayload?.dynamicOutputs?.find((d) => d.fieldName === "placa");
    expect(colDyno).toBeDefined();
    expect(colDyno?.kind).toBe("column");
    expect(colDyno?.id).toBe("col_placa");
  });

  test("ForEach: '+' lista intrinsecos + colunas do schema do input upstream", async ({ page }) => {
    const captured: Captured = { flowPosts: [] };
    await installRoutes(page, captured);

    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/editor" });

    // Cria AllRowsSource(carros) + ForEach.
    await page.getByTestId("editor-add-AllRowsSource").click();
    await expect(page.getByTestId("node-AllRowsSource")).toBeVisible();
    await page.getByTestId("editor-add-ForEach").click();
    await expect(page.getByTestId("node-ForEach")).toBeVisible();

    // Conecta source.rows → forEach.rows (click-to-connect).
    const srcHandle = page.locator('[data-testid="node-AllRowsSource"] .react-flow__handle.source');
    const feHandle = page.locator('[data-testid="node-ForEach"] .react-flow__handle.target');
    await srcHandle.click();
    await feHandle.click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    // Abre "+" do ForEach.
    const addBtn = page.getByTestId("node-ForEach").locator(".editor-node-add-output");
    await addBtn.click();
    const popover = page.getByTestId(/socket-add-popover-/);
    await expect(popover).toBeVisible();

    // Intrinsecos disponiveis.
    await expect(page.getByTestId("socket-add-intrinsic-current_row")).toBeVisible();
    await expect(page.getByTestId("socket-add-intrinsic-index")).toBeVisible();
    await expect(page.getByTestId("socket-add-intrinsic-total")).toBeVisible();
    await expect(page.getByTestId("socket-add-intrinsic-result")).toBeVisible();

    // Colunas do schema CARROS propagado via edge.
    await expect(page.getByTestId("socket-add-column-placa")).toBeVisible();
    await expect(page.getByTestId("socket-add-column-id")).toBeVisible();
    await expect(page.getByTestId("socket-add-column-local")).toBeVisible();

    // Filtra: typo "placa" reduz lista.
    await page.getByTestId("socket-add-search").fill("plac");
    await expect(page.getByTestId("socket-add-column-placa")).toBeVisible();
    // intrinsecos sumiram (nao casam "plac").
    await expect(page.getByTestId("socket-add-intrinsic-index")).toHaveCount(0);

    // Adiciona placa.
    await page.getByTestId("socket-add-column-placa").click();
    await expect(popover).toBeHidden();

    // Handle dinamico aparece no node.
    await expect(page.getByTestId("handle-dyn-").first().or(page.locator('[data-testid^="handle-dyn-"]'))).toBeVisible();
  });

  test("dry-run: Source(carros) + ForEach (body com Log usando ${id}) → 3 logs interpolados", async ({ page }) => {
    // Apos rewrite subgraphs: Log vive DENTRO do body do ForEach. Template
    // ${id}/${placa} resolve via frameContext da iteracao, sem necessidade de
    // edge cross-scope explicita.
    const captured: Captured = { flowPosts: [] };
    await installRoutes(page, captured);

    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/editor" });

    // Source + ForEach no root, conectados.
    await page.getByTestId("editor-add-AllRowsSource").click();
    await page.getByTestId("editor-add-ForEach").click();
    await page
      .locator('[data-testid="node-AllRowsSource"] .react-flow__handle.source')
      .click();
    await page
      .locator('[data-testid="node-ForEach"] .react-flow__handle.target')
      .click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    // Double-click no ForEach pra entrar no body.
    await page.getByTestId("node-ForEach").dblclick();
    await expect(page.getByTestId("editor-breadcrumb")).toBeVisible();

    // Adiciona Log DENTRO do body.
    await page.getByTestId("editor-add-LogNode").click();
    await page.getByTestId("node-LogNode").click();

    // Edita prefix com template — frameContext da iteracao resolve ${id}/${placa}.
    const templateInput = page.locator('[data-testid^="editor-field-prefix-input-"]').first();
    await expect(templateInput).toBeVisible();
    await templateInput.fill("Veiculo ${id} (${placa})");

    // Voltar pro root e executar dry-run.
    await page.getByTestId("editor-breadcrumb-root").click();
    await page.getByTestId("editor-dry-run").click();

    const consoleBox = page.getByTestId("editor-console");
    await expect(consoleBox).toBeVisible();
    await expect(consoleBox).toContainText("Dry-run OK");
    await expect(consoleBox).toContainText("Veiculo 00000000-0000-4000-8000-000000000001 (ABC1A23)");
    await expect(consoleBox).toContainText("Veiculo 00000000-0000-4000-8000-000000000002 (DEF2B45)");
    await expect(consoleBox).toContainText("Veiculo 00000000-0000-4000-8000-000000000003 (GHI3C67)");
  });

  test("Filter: in-node dropdown popula colunas do upstream", async ({ page }) => {
    const captured: Captured = { flowPosts: [] };
    await installRoutes(page, captured);

    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/editor" });

    // Source(carros) -> Filter
    await page.getByTestId("editor-add-AllRowsSource").click();
    await page.getByTestId("editor-add-Filter").click();

    const srcHandle = page.locator('[data-testid="node-AllRowsSource"] .react-flow__handle.source');
    const filterHandle = page.locator('[data-testid="node-Filter"] .react-flow__handle.target');
    await srcHandle.click();
    await filterHandle.click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    // O Filter agora tem in-node dropdown pra "Coluna" — verifica que select existe.
    const filterNode = page.getByTestId("node-Filter");
    const colSelect = filterNode.locator(".editor-node-inline-select").first();
    await expect(colSelect).toBeVisible();
    // Lista de options inclui placa (CARROS).
    await expect(colSelect.locator('option[value="placa"]')).toHaveCount(1);
    await expect(colSelect.locator('option[value="local"]')).toHaveCount(1);
    // Tem fallback "valor customizado" se allowCustom (sim no Filter).
    await expect(colSelect.locator('option').filter({ hasText: /customizado/i })).toHaveCount(1);
  });
});
