import { expect, test, type Page, type Route } from "@playwright/test";

// Workspace do Word em navegador real (/dev/word-workspace-lab), APIs mockadas:
// barra de ponta a ponta, lista de placas (rola), painel da placa com checklist
// e miniaturas, "Novo documento" só pela categoria e a seção condicional.

const PLACAS = 30;

const itens = Array.from({ length: PLACAS }, (_, i) => ({
  carroId: `c-${i + 1}`,
  placa: `AAA${String(i + 1).padStart(2, "0")}X${i % 10}`,
  modelo: `Modelo ${i + 1}`,
  anoFab: 2020,
  anoMod: 2021,
  cor: "PRATA",
  hodometro: 40000,
  preco: 65000,
  estadoVenda: "VENDIDO",
  coverUrl: null,
  situacao: "vendido",
  venda: { id: `v-${i + 1}`, estadoVenda: "concluida", estagio: "aberto", compradorNome: `Cliente ${i + 1}`, dataVenda: "2026-11-09", dataEntrega: null, valorTotal: 65000 },
  documentos: i === 0 ? 1 : 0
}));

const painel = {
  carro: {
    id: "c-1",
    placa: "AAA01X0",
    modelo: "Modelo 1",
    anoFab: 2020,
    anoMod: 2021,
    cor: "PRATA",
    hodometro: 40000,
    preco: 65000,
    chassi: "9BG000",
    renavam: "123",
    estadoVenda: "VENDIDO",
    anoIpvaPago: null,
    temChaveReserva: true,
    temManual: false,
    local: "LOJA",
    coverUrl: null
  },
  situacao: "vendido",
  venda: {
    id: "v-1",
    carro_id: "c-1",
    estado_venda: "concluida",
    estagio: "aberto",
    comprador_nome: "Joao da Silva",
    valor_total: 65000,
    forma_pagamento: "a_vista_pix",
    tipo_transferencia: "loja",
    venda_entradas: []
  },
  documentos: [{ id: "doc-1", titulo: "Recibo de Venda", categoria: "recibo_venda", updatedAt: "2026-11-09T12:00:00Z" }],
  arquivos: []
};

const docRow = (id: string, titulo: string, categoria: string, content: unknown[]) => ({
  id,
  venda_id: "v-1",
  carro_id: "c-1",
  titulo,
  categoria,
  template_id: null,
  conteudo: { type: "doc", content },
  created_at: "2026-11-09T12:00:00Z",
  updated_at: "2026-11-09T12:00:00Z"
});

const RECIBO = docRow("doc-1", "Recibo de Venda", "recibo_venda", [
  { type: "paragraph", content: [{ type: "text", text: "Recibo do veiculo AAA01X0." }] },
  { type: "paragraph", content: [{ type: "text", text: "Clausula da entrada." }] }
]);

async function mockApis(page: Page, criado: { body: Record<string, unknown> | null }) {
  await page.route("**/api/v1/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (data: unknown) => route.fulfill({ json: { data, meta: { request_id: "e2e" } } });

    if (url.pathname === "/api/v1/vendedor/veiculos") return json({ itens, total: itens.length, contagens: null });
    if (url.pathname.startsWith("/api/v1/vendedor/veiculos/")) return json(painel);
    if (url.pathname === "/api/v1/venda-documentos/contexto") return json({ placa: "AAA01X0", compradorNome: "Joao da Silva", valorTotal: 65000, formaPagamento: "a_vista_pix" });
    if (url.pathname === "/api/v1/venda-documentos" && method === "POST") {
      criado.body = route.request().postDataJSON() as Record<string, unknown>;
      return json(docRow("doc-novo", String(criado.body.titulo), String(criado.body.categoria), (criado.body.conteudo as { content: unknown[] }).content));
    }
    if (url.pathname === "/api/v1/venda-documentos") return json([RECIBO]);
    if (url.pathname.startsWith("/api/v1/venda-documentos/")) return json(RECIBO);
    if (url.pathname.startsWith("/api/v1/documento-templates")) return json([]);
    return json({});
  });
}

let criado: { body: Record<string, unknown> | null };

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  criado = { body: null };
  await mockApis(page, criado);
  await page.goto("/dev/word-workspace-lab", { waitUntil: "networkidle" });
  await expect(page.getByTestId("word-app")).toBeVisible({ timeout: 60_000 });
});

test("barra de ponta a ponta, lista de placas aberta à esquerda e rolando por dentro", async ({ page }) => {
  const bar = page.getByTestId("word-bar");
  const pageWidth = await page.evaluate(() => document.body.clientWidth);
  const box = (await bar.boundingBox())!;
  expect(box.x).toBe(0);
  expect(Math.round(box.width)).toBe(pageWidth);
  await expect(page.getByTestId("word-bar-ribbon")).toBeHidden();

  const nav = page.getByTestId("word-nav");
  expect((await nav.boundingBox())!.x).toBe(0);
  await expect(page.locator("[data-testid^='word-placa-c-']")).toHaveCount(PLACAS);

  const scroller = page.getByTestId("word-nav-scroll");
  const dims = await scroller.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(dims.sh).toBeGreaterThan(dims.ch);
  const last = page.locator("[data-testid^='word-placa-c-']").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
});

test("placa → painel com checklist e miniatura → abre o doc com o ribbon na barra → volta", async ({ page }) => {
  await page.getByTestId("word-placa-c-1").click();
  await expect(page.getByTestId("word-placa-painel")).toBeVisible();
  await expect(page.getByTestId("word-check-recibo_venda")).toContainText("1 gerado");
  await expect(page.getByTestId("word-check-termo_entrega")).toContainText("Recomendado");
  await expect(page.locator(".word-thumb-page")).toHaveCount(1);

  await page.getByRole("button", { name: "Abrir documento Recibo de Venda" }).click();
  await expect(page.locator(".word-editor-content")).toContainText("Recibo do veiculo AAA01X0");
  await expect(page.getByTestId("word-bar").locator(".word-title-input")).toHaveValue("Recibo de Venda");
  await expect(page.getByTestId("word-bar-ribbon").locator(".word-toolbar")).toBeVisible();
  await expect(page.getByLabel("Categoria do documento")).toHaveValue("recibo_venda");

  await page.getByRole("button", { name: "Voltar para a placa" }).click();
  await expect(page.getByTestId("word-placa-painel")).toBeVisible();
});

test("Novo documento pede só a categoria e já abre o modelo dinâmico", async ({ page }) => {
  await page.getByTestId("word-placa-c-1").click();
  await page.getByTestId("word-novo-documento").click();
  await expect(page.getByTestId("novo-doc-categoria")).toBeVisible();
  await page.getByTestId("novo-doc-categoria-termo_entrega").click();

  await expect.poll(() => criado.body?.categoria).toBe("termo_entrega");
  expect(criado.body?.titulo).toBe("Termo de Entrega");
  expect(JSON.stringify(criado.body?.conteudo)).toContain("conditionalBlock");
  await expect(page.locator(".word-editor-content")).toContainText("TERMO DE ENTREGA");
  await expect(page.locator(".word-editor-content .word-cond")).toHaveCount(1);
});

test("seção condicional: a etiqueta escolhe a condição e o preview esconde o que não vale", async ({ page }) => {
  await page.getByTestId("word-placa-c-1").click();
  await page.getByRole("button", { name: "Abrir documento Recibo de Venda" }).click();
  const content = page.locator(".word-editor-content");
  await content.locator("p", { hasText: "Clausula da entrada" }).click();
  await page.getByTestId("word-tb-condicao").click();

  const secao = content.locator(".word-cond");
  await expect(secao).toHaveCount(1);
  await expect(secao.locator(".word-cond-select")).toHaveValue("tem_entrada");
  await expect(secao).toContainText("Clausula da entrada");

  // Venda à vista sem entrada: o trecho some na visualização...
  await page.getByRole("button", { name: "Visualizar" }).click();
  await expect(page.locator(".word-preview .word-print")).toContainText("RECIBO DO VEICULO".toLowerCase(), { ignoreCase: true });
  await expect(page.locator(".word-preview .word-print")).not.toContainText("Clausula da entrada");

  // ...e aparece quando a condição casa (à vista).
  await page.getByRole("button", { name: "Editar" }).click();
  await content.locator(".word-cond-select").selectOption("a_vista");
  await page.getByRole("button", { name: "Visualizar" }).click();
  await expect(page.locator(".word-preview .word-print")).toContainText("Clausula da entrada");
});

test("card do documento com Imprimir à mão; trocar de placa limpa o palco na hora; ordem Recentes/A–Z", async ({ page }) => {
  await expect(page.getByTestId("word-placas-ordem-recentes")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("word-placas-ordem-az").click();
  await expect(page.getByTestId("word-placas-ordem-az")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("word-placa-c-1").click();
  const card = page.getByTestId("word-doc-doc-1");
  await expect(card.getByTestId("word-doc-imprimir")).toBeVisible();
  await expect(card.getByTestId("word-doc-imprimir")).toBeEnabled();

  // O mock devolve sempre o painel da c-1: a c-2 fica "abrindo" — e o painel
  // da placa anterior NÃO pode continuar na tela.
  await page.getByTestId("word-placa-c-2").click();
  await expect(page.getByTestId("word-placa-painel")).toBeHidden();
  await expect(page.getByTestId("veiculo-abrindo")).toContainText("AAA02X1");
  await expect(page.getByTestId("word-placa-c-2")).toHaveAttribute("aria-busy", "true");
});
