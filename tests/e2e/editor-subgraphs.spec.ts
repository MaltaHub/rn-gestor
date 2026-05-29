import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAsDevRole } from "./helpers/auth";

const FIXED_DATE = "2026-05-26T12:00:00.000Z";
const ADMIN_USER_ID = "44444444-4444-4444-8444-444444444444";

type Captured = {
  flowPosts: Array<Record<string, unknown>>;
};

async function installRoutes(page: Page, captured: Captured) {
  const envelope = (data: unknown) =>
    JSON.stringify({ data, meta: { request_id: "e2e-editor-subgraphs" } });

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
        id: "flow-subgraph",
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
    await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
  });

  await page.route("**/api/v1/editor-variables**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
  });
}

test.describe("Editor subgraphs lexicais", () => {
  test("ForEach mostra indicador (body); double-click entra no body via breadcrumb; voltar", async ({ page }) => {
    const captured: Captured = { flowPosts: [] };
    await installRoutes(page, captured);

    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/editor" });

    // Adiciona ForEach — vem com body inicializado + indicador "(body)" no header.
    await page.getByTestId("editor-add-ForEach").click();
    const feNode = page.getByTestId("node-ForEach");
    await expect(feNode).toBeVisible();
    // Indicador visual presente.
    await expect(feNode.locator(".editor-node-body-badge")).toBeVisible();

    // Sem breadcrumb no root.
    await expect(page.getByTestId("editor-breadcrumb")).toHaveCount(0);

    // Double-click entra no body — breadcrumb aparece, canvas vazio.
    await feNode.dblclick();
    await expect(page.getByTestId("editor-breadcrumb")).toBeVisible();
    await expect(page.getByTestId("editor-breadcrumb-root")).toBeVisible();
    await expect(page.getByTestId("editor-breadcrumb-step-0")).toBeVisible();
    // No body novo, nenhum node deve estar visivel ainda.
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    // Adiciona LogNode DENTRO do body
    await page.getByTestId("editor-add-LogNode").click();
    await expect(page.getByTestId("node-LogNode")).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(1);

    // Click no breadcrumb root volta pro graph principal
    await page.getByTestId("editor-breadcrumb-root").click();
    await expect(page.getByTestId("editor-breadcrumb")).toHaveCount(0);
    // No graph principal, so o ForEach.
    await expect(page.getByTestId("node-ForEach")).toBeVisible();
    await expect(page.getByTestId("node-LogNode")).toHaveCount(0);

    // Salvar como — payload tem o LogNode DENTRO do body do ForEach.
    page.on("dialog", async (dialog) => {
      if (dialog.type() === "prompt") await dialog.accept("Fluxo com body");
      else await dialog.accept();
    });
    await page.getByTestId("editor-title-input").fill("Fluxo com body");
    await page.getByTestId("editor-save-as").click();
    await expect.poll(() => captured.flowPosts.length).toBe(1);

    const posted = captured.flowPosts[0] as {
      graph: {
        nodes: Array<{
          type: string;
          body?: { nodes: Array<{ type: string }>; edges: unknown[] };
        }>;
      };
    };
    const fe = posted.graph.nodes.find((n) => n.type === "ForEach");
    expect(fe?.body).toBeDefined();
    expect(fe?.body?.nodes.map((n) => n.type)).toEqual(["LogNode"]);
    // LogNode NAO esta no graph principal.
    expect(posted.graph.nodes.find((n) => n.type === "LogNode")).toBeUndefined();
  });

  test("dry-run: Source -> ForEach com body executando LogNode por iteracao", async ({ page }) => {
    const captured: Captured = { flowPosts: [] };
    await installRoutes(page, captured);

    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/editor" });

    // Source no root + ForEach no root
    await page.getByTestId("editor-add-AllRowsSource").click();
    await page.getByTestId("editor-add-ForEach").click();

    // Conecta source.rows -> forEach.rows
    const srcHandle = page.locator('[data-testid="node-AllRowsSource"] .react-flow__handle.source');
    const feIn = page.locator('[data-testid="node-ForEach"] .react-flow__handle.target');
    await srcHandle.click();
    await feIn.click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    // Adiciona current_row no ForEach via "+"
    await page.getByTestId("node-ForEach").locator(".editor-node-add-output").click();
    await page.getByTestId("socket-add-intrinsic-current_row").click();

    // Entra no body via double-click
    await page.getByTestId("node-ForEach").dblclick();
    await expect(page.getByTestId("editor-breadcrumb")).toBeVisible();

    // Dentro do body: adiciona LogNode e conecta cross-scope ForEach.current_row -> log.input
    await page.getByTestId("editor-add-LogNode").click();
    await expect(page.getByTestId("node-LogNode")).toBeVisible();

    // Edit prefix com template ${placa}
    await page.getByTestId("node-LogNode").click();
    const prefixInput = page.locator('[data-testid^="editor-field-prefix-input-"]').first();
    await prefixInput.fill("placa=${placa}");

    // Dry-run — produz 3 logs (mock carros) interpolados.
    // OBS: O Dry-run roda no graph completo (root) — bodyPath nao afeta a execucao.
    await page.getByTestId("editor-dry-run").click();
    const consoleBox = page.getByTestId("editor-console");
    await expect(consoleBox).toBeVisible();
    await expect(consoleBox).toContainText("Dry-run OK");
    await expect(consoleBox).toContainText("placa=ABC1A23");
    await expect(consoleBox).toContainText("placa=DEF2B45");
    await expect(consoleBox).toContainText("placa=GHI3C67");
  });
});
