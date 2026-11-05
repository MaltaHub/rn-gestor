import { expect, test, type Page, type Route } from "@playwright/test";

const NOW = new Date().toISOString();
const PIXEL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='30'%3E%3Crect width='40' height='30' fill='%2393c5fd'/%3E%3C/svg%3E";

function folder(id: string, parentId: string | null, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    parentId,
    name,
    displayName: name,
    description: null,
    automationKey: null,
    automationRepositoryKey: null,
    managedCarroId: null,
    isAutomationPaused: false,
    vehicle: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra
  };
}

function file(id: string, folderId: string, name: string, sortOrder: number) {
  return { id, folderId, name, mimeType: "image/png", sizeBytes: 24_000 + sortOrder, sortOrder, createdAt: NOW, updatedAt: NOW };
}

function buildIndex() {
  return {
    generatedAt: NOW,
    folders: [
      folder("repo-fotos", null, "Fotos dos Veiculos", { automationRepositoryKey: "vehicle_photos_active" }),
      folder("central", null, "Central"),
      folder("car-1", "repo-fotos", "uuid-car-1", {
        displayName: "ABC1D23",
        automationKey: "vehicle_photos",
        managedCarroId: "carro-1",
        vehicle: { id: "carro-1", placa: "ABC1D23", label: "ABC1D23 — Onix 2022 — Prata", coverFileId: "f-2" }
      }),
      folder("contratos", "central", "Contratos")
    ],
    files: [
      file("f-1", "car-1", "frente.png", 0),
      file("f-2", "car-1", "lateral.png", 1),
      file("f-3", "contratos", "contrato-assinado.png", 0)
    ]
  };
}

type Calls = { index: number; mutations: Array<{ method: string; url: string; body: unknown }> };

/** PDF mínimo com camada de texto (o runtime lê com pdf.js, sem OCR). */
function textPdf(lines: Array<[number, number, string]>) {
  const content = lines.map(([x, y, text]) => `BT /F1 14 Tf ${x} ${y} Td (${text}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, position) => {
    offsets.push(out.length);
    out += `${position + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const CRLV_TEMPLATE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "CRLV",
  documentTypeKey: "crlv_branco",
  active: true,
  applyMode: "confirm",
  markReady: false,
  sampleFileId: null,
  hasSampleDocument: false,
  updatedAt: NOW,
  anchors: [{ kind: "vehicle", field: "placa" }],
  fields: [
    {
      id: "renavam",
      label: "Renavam",
      mode: "value",
      destination: "carros.renavam",
      region: null,
      sampleText: "",
      transforms: ["digits_only"],
      wildcards: [{ kind: "length", min: 11, max: 11 }],
      required: false
    }
  ]
};

async function mockFilesApi(page: Page, index = buildIndex(), templates: unknown[] | (() => unknown[]) = []) {
  const calls: Calls = { index: 0, mutations: [] };
  const ok = (route: Route, data: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });

  await page.route("**/api/v1/files/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1/files", "");
    const body = request.postData() ? JSON.parse(request.postData() ?? "null") : null;

    if (path === "/index") {
      calls.index += 1;
      return ok(route, index);
    }
    if (path === "/sign") {
      const ids = (body?.fileIds ?? []) as string[];
      return ok(route, {
        variant: body?.variant,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        urls: Object.fromEntries(ids.map((id) => [id, { url: PIXEL, missing: false }]))
      });
    }
    if (path === "/ocr/templates") {
      return ok(route, { templates: typeof templates === "function" ? templates() : templates });
    }
    if (path === "/inconsistencies") {
      return ok(route, {
        issues: [
          { kind: "missing_documents_folder", carroId: "carro-1", placa: "ABC1D23", folderId: null, detail: "Estado: DISPONÍVEL." },
          { kind: "automation_paused", carroId: "carro-1", placa: "ABC1D23", folderId: "car-1", detail: "Pausada." }
        ]
      });
    }
    if (path === "/automation-config") {
      return ok(route, { displayField: "placa", repositories: {}, configs: [] });
    }

    calls.mutations.push({ method: request.method(), url: path, body });
    if (path === "/folders" && request.method() === "POST") {
      return ok(route, { folder: folder("novo", body.parentFolderId ?? null, body.name) });
    }
    const fileMatch = path.match(/^\/files\/([^/]+)$/);
    if (fileMatch && request.method() === "PATCH") {
      const current = index.files.find((entry) => entry.id === fileMatch[1]);
      return ok(route, { file: { ...current, name: body.fileName } });
    }
    if (path === "/files/bulk") {
      return ok(route, body.action === "delete" ? { deletedIds: body.fileIds } : { files: [] });
    }
    if (path === "/uploads/prepare") {
      return ok(route, {
        entries: body.files.map((entry: { fileName: string; mimeType: string; sizeBytes: number }, position: number) => ({
          ...entry,
          fileId: `up-${position}`,
          storagePath: `${body.folderId}/up-${position}-x`,
          signedUrl: "https://upload.test/put"
        }))
      });
    }
    if (path === "/uploads/finalize") {
      return ok(route, {
        folderId: body.folderId,
        files: body.entries.map((entry: { fileId: string; fileName: string; mimeType: string; sizeBytes: number }) => ({
          id: entry.fileId,
          folderId: body.folderId,
          name: entry.fileName,
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
          sortOrder: 9,
          createdAt: NOW,
          updatedAt: NOW
        }))
      });
    }
    return ok(route, {});
  });

  return calls;
}

async function signInAsAdmin(page: Page) {
  await page.goto("/login?next=%2Farquivos", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("auth-dev-panel")).toBeVisible();
  await page.getByTestId("auth-dev-role").selectOption("ADMINISTRADOR");
  await page.getByTestId("auth-dev-submit").click();
  await expect(page).toHaveURL(/\/arquivos/);
  await expect(page.getByTestId("file-explorer")).toBeVisible();
}

test.describe.configure({ retries: 1, timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("rn-gestor.files.lastFolderId");
    window.localStorage.removeItem("rn-gestor.files.explorer-prefs.v1");
    window.sessionStorage.clear();
  });
});

test("navega entre pastas em memória, sem nova requisição", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await mockFilesApi(page);
  await signInAsAdmin(page);

  const content = page.getByTestId("explorer-content");
  await expect(content.locator("[data-key='d:repo-fotos']")).toBeVisible();
  expect(calls.index).toBe(1);

  // Um clique abre a pasta (navegação e seleção são modos separados).
  await content.locator("[data-key='d:repo-fotos']").click();
  await content.locator("[data-key='d:car-1']").click();
  await expect(content.locator("[data-key='f:f-1']")).toBeVisible();
  await expect(content.locator("[aria-selected=true]")).toHaveCount(0);
  await expect(page.getByTestId("explorer-address")).toContainText("ABC1D23");
  await expect(page.getByTestId("explorer-details-pane")).toContainText("Onix 2022");

  // Voltar / subir / avançar continuam locais.
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(content.locator("[data-key='d:car-1']")).toBeVisible();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(content.locator("[data-key='f:f-2']")).toBeVisible();
  await content.focus();
  await page.keyboard.press("Backspace");
  await expect(content.locator("[data-key='d:car-1']")).toBeVisible();

  expect(calls.index).toBe(1);
});

test("pastas do sistema têm cadeado e não oferecem renomear/excluir", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockFilesApi(page);
  await signInAsAdmin(page);
  const content = page.getByTestId("explorer-content");

  await expect(content.locator("[data-key='d:repo-fotos'] [data-testid=folder-lock]")).toBeVisible();
  await expect(content.locator("[data-key='d:central'] [data-testid=folder-lock]")).toHaveCount(0);

  await content.locator("[data-key='d:repo-fotos']").click({ button: "right" });
  const menu = page.getByTestId("explorer-context-menu");
  await expect(menu.getByRole("menuitem", { name: /Renomear/ })).toBeDisabled();
  await page.keyboard.press("Escape");

  await content.locator("[data-key='d:repo-fotos']").click();
  await expect(content.locator("[data-key='d:car-1'] [data-testid=folder-lock]")).toBeVisible();
  await content.locator("[data-key='d:car-1']").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("explorer-cmd-rename")).toBeDisabled();
  await expect(page.getByTestId("explorer-cmd-delete")).toBeEnabled();
  await page.getByTestId("explorer-cmd-delete").click();
  await expect(page.getByTestId("explorer-confirm")).toHaveCount(0);
});

test("selecionar tudo e compartilhar fotos da pasta do veículo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockFilesApi(page);
  await page.route("**/api/v1/carros/carro-1/compartilhar", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { token: "t", url: "https://loja.test/galeria/t" } }) })
  );
  await signInAsAdmin(page);
  const content = page.getByTestId("explorer-content");
  await content.locator("[data-key='d:repo-fotos']").click();
  await content.locator("[data-key='d:car-1']").click();

  // Sem seleção: painel da pasta de fotos oferece o link da galeria.
  await expect(page.getByTestId("explorer-share-panel")).toContainText("Copiar link da galeria");

  await page.getByTestId("explorer-cmd-select-all").click();
  await expect(content.locator("[aria-selected=true]")).toHaveCount(2);
  await expect(page.getByTestId("explorer-share-files")).toHaveText(/Compartilhar 2 fotos/);

  // No modo seleção o clique marca/desmarca em vez de abrir.
  await content.locator("[data-key='f:f-1']").click();
  await expect(content.locator("[aria-selected=true]")).toHaveCount(1);
  await expect(page.getByTestId("explorer-viewer")).toHaveCount(0);
  await expect(page.getByTestId("explorer-share-files")).toHaveText(/Compartilhar 1 foto/);
});

test("lembra a rolagem da pasta ao voltar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  const index = buildIndex();
  for (let position = 0; position < 80; position += 1) index.files.push(file(`many-${position}`, "contratos", `doc-${position}.png`, position + 1));
  await mockFilesApi(page, index);
  await signInAsAdmin(page);
  const content = page.getByTestId("explorer-content");
  await content.locator("[data-key='d:central']").click();
  await content.locator("[data-key='d:contratos']").click();
  await content.evaluate((element) => (element.scrollTop = 900));
  await page.waitForTimeout(600);
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(content.locator("[data-key='d:contratos']")).toBeVisible();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(content.locator("[data-key='f:many-0']")).toBeAttached();
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(800);
});

test("busca instantânea por caminho e nome de arquivo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockFilesApi(page);
  await signInAsAdmin(page);

  await page.getByTestId("explorer-search").fill("central assinado");
  await expect(page.getByTestId("explorer-search-banner")).toContainText("1 resultado");
  const hit = page.getByTestId("explorer-content").locator("[data-key='f:f-3']");
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("Central / Contratos");

  // Placa sem hífen/caixa acha a pasta do veículo.
  await page.getByTestId("explorer-search").fill("abc1d");
  await expect(page.getByTestId("explorer-content").locator("[data-key='d:car-1']")).toBeVisible();

  // "Local" leva à pasta do resultado e limpa a busca.
  await page.getByTestId("explorer-search").fill("frente");
  await page.getByTestId("explorer-content").locator("[data-key='f:f-1']").getByRole("button", { name: /ABC1D23/ }).click();
  await expect(page.getByTestId("explorer-search")).toHaveValue("");
  await expect(page.getByTestId("explorer-content").locator("[data-key='f:f-2']")).toBeVisible();
});

test("renomeia com F2, cria pasta inline e exclui com confirmação", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await mockFilesApi(page);
  await signInAsAdmin(page);
  const content = page.getByTestId("explorer-content");

  await content.locator("[data-key='d:central']").click();
  await content.locator("[data-key='d:contratos']").click();
  await content.locator("[data-key='f:f-3']").click({ modifiers: ["Control"] });
  await page.keyboard.press("F2");
  const input = page.getByTestId("explorer-rename-input");
  await input.fill("contrato-final.png");
  await input.press("Enter");
  await expect(content.locator("[data-key='f:f-3']")).toContainText("contrato-final.png");
  expect(calls.mutations).toContainEqual(expect.objectContaining({ method: "PATCH", url: "/files/f-3", body: { fileName: "contrato-final.png" } }));

  // Com item selecionado a barra mostra as ações da seleção; Esc volta às da pasta.
  await page.keyboard.press("Escape");
  await page.getByTestId("explorer-cmd-new-folder").click();
  const newName = page.getByTestId("explorer-new-folder").getByTestId("explorer-rename-input");
  await newName.fill("Aditivos");
  await newName.press("Enter");
  await expect(content.locator("[data-key='d:novo']")).toContainText("Aditivos");

  await content.locator("[data-key='f:f-3']").click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await page.getByTestId("explorer-confirm-ok").click();
  await expect(content.locator("[data-key='f:f-3']")).toHaveCount(0);
  expect(calls.mutations).toContainEqual(expect.objectContaining({ url: "/files/bulk", body: { action: "delete", fileIds: ["f-3"] } }));
});

test("estado vazio permite criar a primeira pasta", async ({ page }) => {
  await mockFilesApi(page, { generatedAt: NOW, folders: [], files: [] });
  await signInAsAdmin(page);
  await expect(page.getByText("Nenhuma pasta ainda.")).toBeVisible();
  await page.getByRole("button", { name: "Criar a primeira pasta" }).click();
  await expect(page.getByTestId("explorer-new-folder")).toBeVisible();
});

test("cabe na viewport (só a lista rola) no desktop e no celular", async ({ page }) => {
  await mockFilesApi(page);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await signInAsAdmin(page);
    await expect(page.getByTestId("explorer-content").locator("[data-key]").first()).toBeVisible();
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.body.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight
    }));
    expect(overflow.x, `scroll horizontal em ${viewport.width}px`).toBeLessThanOrEqual(1);
    expect(overflow.y, `scroll vertical em ${viewport.width}px`).toBeLessThanOrEqual(1);
  }
});

test("árvore só expande no clique e recolhe tudo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockFilesApi(page);
  await signInAsAdmin(page);
  const tree = page.getByRole("navigation", { name: "Pastas" });
  const content = page.getByTestId("explorer-content");

  // Navegar NÃO expande a árvore.
  await content.locator("[data-key='d:repo-fotos']").click();
  await expect(tree.getByRole("button", { name: "ABC1D23", exact: true })).toHaveCount(0);

  await tree.getByRole("button", { name: "Expandir Fotos dos Veiculos" }).click();
  await expect(tree.getByRole("button", { name: "ABC1D23", exact: true })).toBeVisible();
  await page.getByTestId("tree-collapse-all").click();
  await expect(tree.getByRole("button", { name: "ABC1D23", exact: true })).toHaveCount(0);
});

test("filtra inconsistências e abre a pasta do item", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockFilesApi(page);
  await signInAsAdmin(page);
  await page.getByTestId("explorer-cmd-tools").click();
  await page.getByTestId("explorer-cmd-issues").click();
  const issues = page.getByTestId("explorer-issues");
  await expect(issues).toContainText("2 encontrada(s)");
  await issues.getByTestId("issues-filter-automation_paused").click();
  await expect(issues.getByText("Sem pasta de documentos")).toHaveCount(1); // só o chip
  await issues.getByRole("button", { name: "Abrir pasta" }).click();
  await expect(page.getByTestId("explorer-issues")).toHaveCount(0);
  await expect(page.getByTestId("explorer-content").locator("[data-key='f:f-1']")).toBeVisible();
});

function docsIndex() {
  const index = buildIndex();
  index.folders.push(
    folder("repo-docs", null, "Documentos", { automationRepositoryKey: "vehicle_documents_active" }),
    folder("car-1-docs", "repo-docs", "uuid-car-1", {
      displayName: "ABC1D23",
      automationKey: "vehicle_documents",
      managedCarroId: "carro-1",
      vehicle: { id: "carro-1", placa: "ABC1D23", label: "ABC1D23 — Onix 2022 — Prata", coverFileId: null }
    })
  );
  return index;
}

async function openDocsFolder(page: Page) {
  const content = page.getByTestId("explorer-content");
  await content.locator("[data-key='d:repo-docs']").click();
  await content.locator("[data-key='d:car-1-docs']").click();
}

async function uploadCrlv(page: Page, name: string, plate: string, renavam = "01234567890") {
  await page.getByTestId("explorer-file-input").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: textPdf([
      [50, 760, "PLACA"],
      [50, 742, plate],
      [300, 760, "RENAVAM"],
      [300, 742, renavam]
    ])
  });
  await page.getByTestId("document-classify-select-0").selectOption("crlv_branco");
  await page.getByTestId("document-classify-confirm").click();
}

async function mockVehicle(page: Page, vehicle: Record<string, unknown>) {
  await page.route("**/api/v1/carros/carro-1", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "carro-1", placa: "ABC1D23", ...vehicle } }) })
  );
}

test("upload usa a versão ATUAL do template (âncora adicionada depois de abrir a tela)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let served = 0;
  // 1ª leitura (ao abrir a tela): template SEM âncora; depois o console salva a âncora.
  const calls = await mockFilesApi(page, docsIndex(), () => (served++ === 0 ? [{ ...CRLV_TEMPLATE, anchors: [] }] : [CRLV_TEMPLATE]));
  await mockVehicle(page, { chassi: null, renavam: null });
  await signInAsAdmin(page);
  await openDocsFolder(page);

  await uploadCrlv(page, "crlv-de-outro-carro.pdf", "XYZ9K88");
  await expect(page.getByText(/Upload cancelado.*placa do veículo ABC1D23/)).toBeVisible({ timeout: 30_000 });
  expect(calls.mutations.some((call) => call.url === "/uploads/prepare" || call.url === "/ocr/apply")).toBe(false);
});

test("modo automático não sobrescreve valor diferente do que o veículo já tem", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await mockFilesApi(page, docsIndex(), [{ ...CRLV_TEMPLATE, applyMode: "auto" }]);
  await page.route("https://upload.test/put", (route) => route.fulfill({ status: 200, body: "{}" }));
  await mockVehicle(page, { chassi: null, renavam: "01326021769" });
  await signInAsAdmin(page);
  await openDocsFolder(page);

  await uploadCrlv(page, "crlv.pdf", "ABC1D23", "01234567890");
  await expect(page.getByTestId("ocr-apply-dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ocr-apply-conflict-carros.renavam")).toContainText("01326021769");
  expect(calls.mutations.some((call) => call.url === "/ocr/apply")).toBe(false);
});

test("âncora: documento sem a placa da pasta cancela o upload; com a placa, sobe", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const index = buildIndex();
  index.folders.push(
    folder("repo-docs", null, "Documentos", { automationRepositoryKey: "vehicle_documents_active" }),
    folder("car-1-docs", "repo-docs", "uuid-car-1", {
      displayName: "ABC1D23",
      automationKey: "vehicle_documents",
      managedCarroId: "carro-1",
      vehicle: { id: "carro-1", placa: "ABC1D23", label: "ABC1D23 — Onix 2022 — Prata", coverFileId: null }
    })
  );
  const calls = await mockFilesApi(page, index, [CRLV_TEMPLATE]);
  await page.route("https://upload.test/put", (route) => route.fulfill({ status: 200, body: "{}" }));
  await signInAsAdmin(page);
  const content = page.getByTestId("explorer-content");
  await content.locator("[data-key='d:repo-docs']").click();
  await content.locator("[data-key='d:car-1-docs']").click();

  const upload = async (name: string, plate: string) => {
    await page.getByTestId("explorer-file-input").setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: textPdf([
        [50, 760, "PLACA"],
        [50, 742, plate],
        [300, 760, "RENAVAM"],
        [300, 742, "01234567890"]
      ])
    });
    await page.getByTestId("document-classify-select-0").selectOption("crlv_branco");
    await page.getByTestId("document-classify-confirm").click();
  };

  // Documento de OUTRO veículo: cancelado, nada sobe.
  await upload("crlv-outro.pdf", "XYZ9K88");
  await expect(page.getByText(/Upload cancelado.*placa do veículo ABC1D23/)).toBeVisible({ timeout: 30_000 });
  expect(calls.mutations.some((call) => call.url === "/uploads/prepare")).toBe(false);

  // Documento certo: sobe e abre a confirmação dos dados lidos.
  await upload("crlv-certo.pdf", "ABC1D23");
  await expect(page.getByTestId("ocr-apply-dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ocr-apply-carros.renavam")).toHaveValue("01234567890");
  await expect(page.getByTestId("ocr-apply-anchors")).toContainText("✓ Placa do veículo da pasta");
  await expect.poll(() => calls.mutations.filter((call) => call.url === "/uploads/prepare").length).toBe(1);
});
