import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAsDevRole } from "./helpers/auth";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_DATE = "2026-05-25T12:00:00.000Z";
const ADMIN_USER_ID = "44444444-4444-4444-8444-444444444444";

type EditorFlowFixture = {
  id: string;
  title: string;
  description: string | null;
  sheet_key: string | null;
  graph: {
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      config?: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      sourceHandle?: string;
      target: string;
      targetHandle?: string;
    }>;
    viewport?: { x: number; y: number; zoom: number };
  };
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

function makeFlowWithLog(): EditorFlowFixture {
  return {
    id: "flow-with-log",
    title: "Smoke: Constante to Log",
    description: "Dry-run produz log via aresta ConstantNode -> LogNode.",
    sheet_key: null,
    graph: {
      nodes: [
        {
          id: "node-const",
          type: "ConstantNode",
          position: { x: 80, y: 80 },
          config: { value: "hello-e2e" }
        },
        {
          id: "node-log",
          type: "LogNode",
          position: { x: 360, y: 80 },
          config: { prefix: "E2E" }
        }
      ],
      edges: [
        {
          id: "edge-const-log",
          source: "node-const",
          sourceHandle: "value",
          target: "node-log",
          targetHandle: "input"
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    created_by_user_id: ADMIN_USER_ID,
    created_at: FIXED_DATE,
    updated_at: FIXED_DATE
  };
}

function makeFlowEmpty(): EditorFlowFixture {
  return {
    id: "flow-empty",
    title: "Smoke: Fluxo vazio",
    description: null,
    sheet_key: "carros",
    graph: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    created_by_user_id: ADMIN_USER_ID,
    created_at: FIXED_DATE,
    updated_at: FIXED_DATE
  };
}

// ---------------------------------------------------------------------------
// API mocks
// ---------------------------------------------------------------------------

type Captured = {
  flowPosts: Array<Record<string, unknown>>;
  flowPatches: Array<{ id: string; body: Record<string, unknown> }>;
  flowDeletes: string[];
  runStarts: number;
  runPatches: Array<{ id: string; body: Record<string, unknown> }>;
};

function emptyCaptured(): Captured {
  return {
    flowPosts: [],
    flowPatches: [],
    flowDeletes: [],
    runStarts: 0,
    runPatches: []
  };
}

async function installEditorRoutes(
  page: Page,
  options: {
    initialFlows: EditorFlowFixture[];
    captured: Captured;
  }
) {
  // Mutable working list of flows, mirroring server state across the test.
  const flows: EditorFlowFixture[] = [...options.initialFlows];
  const runs: unknown[] = [];

  function envelope(data: unknown) {
    return JSON.stringify({ data, meta: { request_id: "e2e-editor" } });
  }

  await page.route("**/api/v1/editor-flows**", async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (method === "GET" && /\/editor-flows(?:\?.*)?$/.test(url.pathname + url.search)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope(flows) });
      return;
    }

    if (method === "POST" && url.pathname.endsWith("/editor-flows")) {
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      options.captured.flowPosts.push(body);
      const created: EditorFlowFixture = {
        id: `flow-created-${flows.length + 1}`,
        title: String(body.title ?? "Sem titulo"),
        description: (body.description as string | null) ?? null,
        sheet_key: (body.sheet_key as string | null) ?? null,
        graph: (body.graph as EditorFlowFixture["graph"]) ?? { nodes: [], edges: [] },
        created_by_user_id: ADMIN_USER_ID,
        created_at: FIXED_DATE,
        updated_at: FIXED_DATE
      };
      flows.unshift(created);
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope(created) });
      return;
    }

    const patchMatch = url.pathname.match(/\/editor-flows\/([^/]+)$/);
    if (patchMatch && method === "PATCH") {
      const [, id] = patchMatch;
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      options.captured.flowPatches.push({ id, body });
      const idx = flows.findIndex((flow) => flow.id === id);
      const base = idx >= 0 ? flows[idx] : null;
      const updated: EditorFlowFixture = {
        ...(base ?? makeFlowEmpty()),
        id,
        title: String(body.title ?? base?.title ?? ""),
        description: (body.description as string | null | undefined) ?? base?.description ?? null,
        sheet_key: (body.sheet_key as string | null | undefined) ?? base?.sheet_key ?? null,
        graph: (body.graph as EditorFlowFixture["graph"]) ?? base?.graph ?? { nodes: [], edges: [] },
        updated_at: FIXED_DATE
      };
      if (idx >= 0) flows[idx] = updated;
      else flows.unshift(updated);
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope(updated) });
      return;
    }

    if (patchMatch && method === "DELETE") {
      const [, id] = patchMatch;
      options.captured.flowDeletes.push(id);
      const idx = flows.findIndex((flow) => flow.id === id);
      if (idx >= 0) flows.splice(idx, 1);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ deleted: true, id })
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
  });

  await page.route("**/api/v1/editor-flow-runs**", async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (method === "GET" && /\/editor-flow-runs(?:\?.*)?$/.test(url.pathname + url.search)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope(runs) });
      return;
    }

    if (method === "POST" && url.pathname.endsWith("/editor-flow-runs")) {
      options.captured.runStarts += 1;
      const body = JSON.parse(request.postData() ?? "{}") as { flow_id?: string };
      const created = {
        id: `run-${options.captured.runStarts}`,
        flow_id: body.flow_id ?? null,
        user_id: ADMIN_USER_ID,
        status: "running",
        current_node_id: null,
        context: {},
        paused_reason: null,
        error: null,
        lock_token: `lock-${options.captured.runStarts}`,
        locked_until: FIXED_DATE,
        started_at: FIXED_DATE,
        updated_at: FIXED_DATE,
        completed_at: null
      };
      runs.unshift(created);
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope(created) });
      return;
    }

    const patchMatch = url.pathname.match(/\/editor-flow-runs\/([^/]+)$/);
    if (patchMatch && method === "PATCH") {
      const [, id] = patchMatch;
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      options.captured.runPatches.push({ id, body });
      const idx = runs.findIndex((run) => (run as { id: string }).id === id);
      const merged = {
        ...(idx >= 0 ? (runs[idx] as Record<string, unknown>) : {}),
        ...body,
        id,
        updated_at: FIXED_DATE,
        completed_at: FIXED_DATE
      };
      if (idx >= 0) runs[idx] = merged;
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope(merged) });
      return;
    }

    if (url.pathname.endsWith("/heartbeat") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ ok: true })
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
  });

  await page.route("**/api/v1/editor-variables**", async (route: Route) => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
      return;
    }
    if (method === "PATCH") {
      // batch-upsert; not exercised in these specs but always respond OK.
      await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: envelope([]) });
  });
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

test.describe("Editor de fluxos", () => {
  test("lista fluxos da organizacao, paleta e console de dry-run", async ({ page }) => {
    const captured = emptyCaptured();
    const seeded = [makeFlowWithLog(), makeFlowEmpty()];
    await installEditorRoutes(page, { initialFlows: seeded, captured });

    // Abre direto via ?flow=<id> — exercita o caminho de "deep-link" pro flow.
    await signInAsDevRole(page, "ADMINISTRADOR", { next: `/editor?flow=${seeded[0].id}` });

    // Sidebar carregou os dois fluxos seeded.
    await expect(page.getByTestId("editor-sidebar")).toBeVisible();
    await expect(page.getByTestId(`editor-flow-${seeded[0].id}`)).toBeVisible();
    await expect(page.getByTestId(`editor-flow-${seeded[1].id}`)).toBeVisible();

    // Paleta tem entries de cada categoria.
    await expect(page.getByTestId("editor-add-ConstantNode")).toBeVisible();
    await expect(page.getByTestId("editor-add-ForEach")).toBeVisible();
    await expect(page.getByTestId("editor-add-Filter")).toBeVisible();
    await expect(page.getByTestId("editor-add-TagSelecionar")).toBeVisible();

    // Toolbar reflete o titulo do flow ativo (carregado via ?flow=...).
    const titleInput = page.getByTestId("editor-title-input");
    await expect(titleInput).toHaveValue(seeded[0].title);

    // Canvas renderiza os nodes do graph carregado de fato visiveis (com
    // initialWidth/initialHeight, React Flow nao precisa esperar ResizeObserver).
    await expect(page.getByTestId("node-ConstantNode")).toBeVisible();
    await expect(page.getByTestId("node-LogNode")).toBeVisible();

    // Dry-run em flow nao-dirty deve persistir: POST start + PATCH com result.
    const dryRun = page.getByTestId("editor-dry-run");
    await expect(dryRun).toBeEnabled();
    await dryRun.click();

    const consoleBox = page.getByTestId("editor-console");
    await expect(consoleBox).toBeVisible();
    await expect(consoleBox).toContainText("Dry-run OK");
    await expect(consoleBox).toContainText("hello-e2e");

    // Confere que a run foi iniciada e patcheada com status=completed.
    expect(captured.runStarts).toBe(1);
    await expect.poll(() => captured.runPatches.length).toBeGreaterThan(0);
    const lastPatch = captured.runPatches.at(-1);
    expect(lastPatch?.body.status).toBe("completed");
    expect(lastPatch?.body.lock_token).toBe("lock-1");
  });

  test("adiciona no pela paleta, edita properties, salva como e exclui", async ({ page }) => {
    const captured = emptyCaptured();
    await installEditorRoutes(page, { initialFlows: [], captured });

    // Stub window.prompt antes da navegacao (Save As usa window.prompt).
    await page.addInitScript(() => {
      window.prompt = () => "Fluxo criado via E2E";
      window.confirm = () => true;
    });

    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/editor" });

    // Sidebar sem fluxos.
    await expect(page.getByTestId("editor-sidebar")).toBeVisible();
    await expect(page.getByTestId("editor-sidebar")).toContainText("Nenhum fluxo ainda.");

    // Salvar antes de criar deve estar bloqueado (sem flow ativo e sem titulo).
    await expect(page.getByTestId("editor-save")).toBeDisabled();
    await expect(page.getByTestId("editor-save-as")).toBeDisabled();
    await expect(page.getByTestId("editor-dry-run")).toBeDisabled();

    // Add ConstantNode pela paleta — deve aparecer visivel imediatamente
    // (initialWidth/initialHeight passados ao React Flow).
    await page.getByTestId("editor-add-ConstantNode").click();
    await expect(page.getByTestId("node-ConstantNode")).toBeVisible();

    // Properties panel exibe o no recem-criado (selecao automatica via onAddNode).
    const properties = page.getByTestId("editor-properties");
    await expect(properties).toContainText("Constante");
    const valueField = page.getByTestId("editor-field-value");
    await expect(valueField).toBeVisible();
    await valueField.fill("42");

    // Add LogNode para exercitar o canvas com dois nodes.
    await page.getByTestId("editor-add-LogNode").click();
    await expect(page.getByTestId("node-LogNode")).toBeVisible();

    // Set titulo e Salvar como.
    await page.getByTestId("editor-title-input").fill("Fluxo criado via E2E");
    const saveAs = page.getByTestId("editor-save-as");
    await expect(saveAs).toBeEnabled();
    await saveAs.click();

    // POST deve ter chegado e toast de sucesso aparece.
    await expect.poll(() => captured.flowPosts.length).toBe(1);
    const posted = captured.flowPosts[0] as {
      title: string;
      graph: { nodes: Array<{ type: string; config?: Record<string, unknown> }> };
    };
    expect(posted.title).toBe("Fluxo criado via E2E");
    expect(posted.graph.nodes.map((n) => n.type).sort()).toEqual(["ConstantNode", "LogNode"]);
    const constNodePayload = posted.graph.nodes.find((n) => n.type === "ConstantNode");
    expect(constNodePayload?.config?.value).toBe("42");

    await expect(page.getByTestId("editor-toast")).toContainText("Fluxo criado.");

    // Sidebar agora lista o flow recem-criado (id mockado).
    await expect(page.getByTestId("editor-flow-flow-created-1")).toBeVisible();

    // Excluir pela toolbar — deve chamar DELETE e limpar a sidebar.
    const deleteBtn = page.getByTestId("editor-delete");
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();

    await expect.poll(() => captured.flowDeletes.length).toBe(1);
    expect(captured.flowDeletes[0]).toBe("flow-created-1");
    await expect(page.getByTestId("editor-toast")).toContainText("Fluxo excluido.");
    await expect(page.getByTestId("editor-flow-flow-created-1")).toHaveCount(0);
  });

  test("conecta dois nos via drag entre handles e valida edge no graph", async ({ page }) => {
    const captured = emptyCaptured();
    await installEditorRoutes(page, { initialFlows: [], captured });

    // Dialog handler pro Save As (prompt) — registrado antes de qualquer prompt.
    page.on("dialog", async (dialog) => {
      if (dialog.type() === "prompt") await dialog.accept("Fluxo com edge");
      else await dialog.accept();
    });

    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/editor" });

    // Adiciona dois nos compativeis (Value -> Value) — onAddNode os posiciona
    // em colunas distintas (60,80) e (280,80), entao source/target nao se sobrepoem.
    await page.getByTestId("editor-add-ConstantNode").click();
    await expect(page.getByTestId("node-ConstantNode")).toBeVisible();
    await page.getByTestId("editor-add-LogNode").click();
    await expect(page.getByTestId("node-LogNode")).toBeVisible();

    // Antes do drag: 0 edges no DOM.
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);

    // Localiza handles: React Flow nomeia ".source" pra Position.Right e ".target"
    // pra Position.Left. Filtramos pelo nodeId via data-nodeid (anexado pelo wrapper).
    const sourceHandle = page.locator(
      '[data-testid="node-ConstantNode"] .react-flow__handle.source'
    );
    const targetHandle = page.locator(
      '[data-testid="node-LogNode"] .react-flow__handle.target'
    );
    await expect(sourceHandle).toBeVisible();
    await expect(targetHandle).toBeVisible();

    // React Flow suporta connect via click (connectOnClick=true por default):
    // clique no source, depois clique no target. Mais confiavel em Playwright
    // que simular drag (que requer dispatch preciso de pointer events).
    await sourceHandle.click();
    await targetHandle.click();

    // Edge deve ter aparecido no DOM.
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    // Confirma payload via Salvar como.
    await page.getByTestId("editor-title-input").fill("Fluxo com edge");
    await page.getByTestId("editor-save-as").click();

    await expect.poll(() => captured.flowPosts.length).toBe(1);
    const posted = captured.flowPosts[0] as {
      graph: {
        nodes: Array<{ id: string; type: string }>;
        edges: Array<{ source: string; sourceHandle?: string; target: string; targetHandle?: string }>;
      };
    };
    expect(posted.graph.edges).toHaveLength(1);
    const edge = posted.graph.edges[0];
    const constId = posted.graph.nodes.find((n) => n.type === "ConstantNode")?.id;
    const logId = posted.graph.nodes.find((n) => n.type === "LogNode")?.id;
    expect(edge.source).toBe(constId);
    expect(edge.target).toBe(logId);
    expect(edge.sourceHandle).toBe("value");
    expect(edge.targetHandle).toBe("input");
  });

  test("drag de node move suavemente sem commits intermediarios", async ({ page }) => {
    const captured = emptyCaptured();
    const seeded = [makeFlowWithLog()];
    await installEditorRoutes(page, { initialFlows: seeded, captured });

    await signInAsDevRole(page, "ADMINISTRADOR", { next: `/editor?flow=${seeded[0].id}` });
    await expect(page.getByTestId(`editor-flow-${seeded[0].id}`)).toBeVisible();
    await expect(page.getByTestId("node-ConstantNode")).toBeVisible();

    const constNode = page.locator('[data-testid="node-ConstantNode"]');
    // Espera o React Flow estabilizar a viewport pos-load (setCenter tem ~250ms anim).
    await page.waitForTimeout(400);

    const beforeBox = await constNode.boundingBox();
    if (!beforeBox) throw new Error("Bloco do ConstantNode nao encontrado.");

    // Drag pelo header (area draggable do node).
    const header = constNode.locator(".editor-node-head");
    const headerBox = await header.boundingBox();
    if (!headerBox) throw new Error("Header do node nao encontrado.");

    const startX = headerBox.x + headerBox.width / 2;
    const startY = headerBox.y + headerBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY + 60, { steps: 30 });
    await page.mouse.up();

    // Aguarda commit final do drag-stop propagar (queueMicrotask + setState).
    await page.waitForTimeout(100);

    // Sucesso = node se moveu (qualquer delta visivel) E nenhum PATCH/POST
    // intermediario aconteceu durante o drag. Validamos via API capture: como
    // o flow nem foi salvado, nao deveria ter chamado PATCH nem POST de flow,
    // nem start de run, mesmo com drag muito longo.
    const afterBox = await constNode.boundingBox();
    if (!afterBox) throw new Error("Bloco do ConstantNode sumiu apos drag.");
    const dx = Math.abs(afterBox.x - beforeBox.x);
    const dy = Math.abs(afterBox.y - beforeBox.y);
    expect(dx + dy).toBeGreaterThan(20);

    expect(captured.flowPatches.length).toBe(0);
    expect(captured.flowPosts.length).toBe(0);
    expect(captured.runStarts).toBe(0);
  });
});
