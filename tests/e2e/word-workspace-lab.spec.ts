import { expect, test, type Page } from "@playwright/test";

// Workspace do Word em navegador real (/dev/word-workspace-lab), com as APIs
// mockadas: barra fixa de ponta a ponta, nav vertical ESQUERDA colapsada
// (Templates antes de Placas), scroll da lista de placas e galeria -> editor.

const PLACAS = 30; // o suficiente para a lista precisar de scroll

const processos = Array.from({ length: PLACAS }, (_, i) => ({
  vendaId: `v-${i + 1}`,
  carroId: `c-${i + 1}`,
  placa: `AAA${String(i + 1).padStart(2, "0")}X${i % 10}`,
  modelo: `Modelo ${i + 1}`,
  dataEntrega: null,
  finalizado: false,
  documentos:
    i === 0
      ? [
          { id: "doc-1", titulo: "Contrato de venda", updatedAt: "2026-06-10T12:00:00Z" },
          { id: "doc-2", titulo: "Procuracao", updatedAt: "2026-06-10T13:00:00Z" }
        ]
      : []
}));

const templates = [
  { id: "t-1", titulo: "Contrato padrão", descricao: "Compra e venda", is_active: true, conteudo: null },
  { id: "t-2", titulo: "Procuração", descricao: null, is_active: true, conteudo: null }
];

const docRow = (id: string, titulo: string) => ({
  id,
  venda_id: "v-1",
  titulo,
  template_id: null,
  conteudo: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: `Documento ${titulo} do veiculo ABC1D23.` }] }
    ]
  },
  created_at: "2026-06-10T12:00:00Z",
  updated_at: "2026-06-10T12:00:00Z"
});

async function mockApis(page: Page) {
  await page.route("**/api/v1/venda-documentos/processos**", (route) =>
    route.fulfill({ json: { data: processos } })
  );
  await page.route("**/api/v1/documento-templates**", (route) => route.fulfill({ json: { data: templates } }));
  await page.route("**/api/v1/venda-documentos/contexto**", (route) =>
    route.fulfill({ json: { data: { placa: "ABC1D23", compradorNome: "Joao da Silva" } } })
  );
  await page.route("**/api/v1/venda-documentos/doc-1", (route) =>
    route.fulfill({ json: { data: docRow("doc-1", "Contrato de venda") } })
  );
  await page.route("**/api/v1/venda-documentos/doc-2", (route) =>
    route.fulfill({ json: { data: docRow("doc-2", "Procuracao") } })
  );
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await mockApis(page);
  await page.goto("/dev/word-workspace-lab", { waitUntil: "networkidle" });
  await expect(page.locator(".word-app")).toBeVisible({ timeout: 60_000 });
});

test("barra fixa de ponta a ponta, flat (sem raio), com a linha do ribbon ao abrir doc", async ({ page }) => {
  const bar = page.locator(".word-bar");
  // Largura util da pagina (o app inteiro reserva scrollbar-gutter no body).
  const pageWidth = await page.evaluate(() => document.body.clientWidth);
  const box = (await bar.boundingBox())!;
  expect(box.x).toBe(0);
  expect(Math.round(box.width)).toBe(pageWidth); // ponta a ponta
  const radius = await bar.evaluate((el) => getComputedStyle(el).borderRadius);
  expect(radius).toBe("0px");

  // Sem doc aberto o ribbon nao aparece.
  await expect(page.locator(".word-bar-ribbon")).toBeHidden();
});

test("nav vertical ESQUERDA colapsada; expandir mostra Templates ANTES de Placas", async ({ page }) => {
  const nav = page.locator(".word-nav");
  const box = (await nav.boundingBox())!;
  expect(box.x).toBe(0); // encostada na esquerda
  expect(box.width).toBeLessThan(60); // rail colapsado

  await page.getByRole("button", { name: "Expandir navegação" }).click();
  const sections = page.locator(".word-side-section-head .word-section-title");
  await expect(sections.first()).toHaveText("Templates");
  await expect(sections.nth(1)).toHaveText("Placas para documentação");
  await expect(page.locator(".word-tpl-item").first()).toContainText("Contrato padrão");
});

test("lista de placas grande ROLA dentro da navegação", async ({ page }) => {
  await page.getByRole("button", { name: "Expandir navegação" }).click();
  await expect(page.locator(".word-placa")).toHaveCount(PLACAS);

  const scroller = page.locator(".word-nav-scroll");
  const dims = await scroller.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(dims.sh).toBeGreaterThan(dims.ch); // ha conteudo alem da dobra

  // A ultima placa fica acessivel rolando a navegacao.
  const last = page.locator(".word-placa").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  const scrolled = await scroller.evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
});

test("placa -> galeria de miniaturas -> clique abre o doc com ribbon na barra", async ({ page }) => {
  await page.getByRole("button", { name: "Expandir navegação" }).click();
  await page.locator(".word-placa").first().click();

  // Barra mostra o contexto da placa + acoes.
  await expect(page.locator(".word-bar-chip")).toContainText("AAA01X0");
  await expect(page.getByRole("button", { name: "+ Novo documento" })).toBeVisible();

  // Galeria com as 2 miniaturas reais + cartao de novo documento.
  await expect(page.locator(".word-thumb-page")).toHaveCount(2);
  await expect(page.locator(".word-thumb-title").first()).toContainText("Contrato de venda");

  // Abre o documento: titulo + ribbon entram na BARRA (portal).
  await page.getByRole("button", { name: "Abrir documento Contrato de venda" }).click();
  await expect(page.locator(".word-editor-content")).toContainText("Documento Contrato de venda");
  await expect(page.locator(".word-bar-head .word-title-input")).toHaveValue("Contrato de venda");
  await expect(page.locator(".word-bar-ribbon .word-toolbar")).toBeVisible();

  // Voltar (<-) retorna para a galeria.
  await page.getByRole("button", { name: "Voltar para a galeria" }).click();
  await expect(page.locator(".word-thumb-page")).toHaveCount(2);
});
