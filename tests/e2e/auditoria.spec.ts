import { expect, test, type Page } from "@playwright/test";
import { installApiMocks } from "./helpers/api-mocks";
import { signInAsDevRole } from "./helpers/auth";

test.describe.configure({ timeout: 90_000 });

const NOW = new Date().toISOString();

const META = {
  tables: [
    { key: "carros", label: "Carros", group: "operacao" },
    { key: "documentos", label: "Documentos", group: "operacao" },
    { key: "arquivos_arquivos", label: "Arquivos", group: "arquivos" }
  ],
  authors: [{ id: "83701bcd-00fa-4af8-81a5-b8ec1f4e8646", name: "Kaic Malta" }],
  retention: { days: 30, maxRowsPerTable: 5000 }
};

function entry<T extends { author: { system: boolean } }>(partial: T) {
  return {
    at: NOW,
    pk: "5460983a-1737-4326-8030-e03c63259c8a",
    placa: "TDV2E99",
    carroId: "5460983a-1737-4326-8030-e03c63259c8a",
    inBatch: false,
    details: null,
    ...partial
  };
}

const ENTRIES = [
  entry({
    id: "e1",
    action: "INSERT",
    table: "arquivos_arquivos",
    tableLabel: "Arquivos",
    pk: "a1",
    author: { id: META.authors[0].id, name: "Kaic Malta", role: "ADMINISTRADOR", system: false },
    details: "Upload de 1 arquivo(s) na pasta Documentos.",
    batchId: "req-1",
    changes: [{ field: "nome_arquivo", label: "Nome do arquivo", before: undefined, after: "crlv_branco_tdv2e99.pdf", omitted: false }]
  }),
  entry({
    id: "e2",
    action: "UPDATE",
    table: "documentos",
    tableLabel: "Documentos",
    author: { id: null, name: "SISTEMA", role: null, system: true },
    details: "Automático: efeito da ação de Kaic Malta — Upload de 1 arquivo(s) na pasta Documentos.",
    batchId: "req-1",
    changes: [{ field: "estado_transferencia", label: "Situação do CRLV", before: "AGUARDANDO", after: "BRANCO", omitted: false }]
  }),
  entry({
    id: "e3",
    action: "UPDATE",
    table: "carros",
    tableLabel: "Carros",
    author: { id: META.authors[0].id, name: "Kaic Malta", role: "ADMINISTRADOR", system: false },
    batchId: "req-0",
    changes: [
      { field: "chassi", label: "Chassi", before: null, after: "9BGEB69A0PG234058", omitted: false },
      { field: "renavam", label: "Renavam", before: "01329637531", after: "01329637532", omitted: false }
    ]
  })
];

async function openAudit(page: Page) {
  const requests: URL[] = [];
  await installApiMocks(page);
  await page.route("**/api/v1/auditoria?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const sistema = url.searchParams.get("origem") === "sistema";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          entries: sistema ? ENTRIES.filter((item) => item.author.system) : ENTRIES,
          nextCursor: null,
          total: sistema ? 1 : ENTRIES.length,
          meta: url.searchParams.get("meta") === "1" ? META : null
        },
        meta: { request_id: "e2e" }
      })
    });
  });
  await signInAsDevRole(page, "ADMINISTRADOR", { next: "/auditoria" });
  await expect(page.getByTestId("audit-explorer")).toBeVisible();
  return requests;
}

test.describe("auditoria", () => {
  test("linha do tempo: ação do usuário com o efeito automático (SISTEMA) no mesmo grupo", async ({ page }) => {
    await openAudit(page);
    const groups = page.getByTestId("audit-group");
    await expect(groups).toHaveCount(2);
    const first = groups.first();
    await expect(first.getByTestId("audit-entry")).toHaveCount(2);
    await expect(first.getByTestId("audit-entry").nth(1)).toContainText("SISTEMA");
    await expect(first.getByTestId("audit-entry").nth(1)).toContainText("AGUARDANDO");
    await expect(first.getByTestId("audit-entry").nth(1)).toContainText("BRANCO");
    await expect(first).toContainText("TDV2E99");
    await expect(page.getByTestId("audit-total")).toContainText("3 alteração(ões)");
    await expect(page.getByText(/Guarda 30 dias ou as últimas 5\.000 alterações por tabela/)).toBeVisible();
  });

  test("filtros viram parâmetros da API (origem, busca, tabela) e o endereço é compartilhável", async ({ page }) => {
    const requests = await openAudit(page);
    await page.getByTestId("audit-origem-sistema").click();
    await expect.poll(() => requests.some((url) => url.searchParams.get("origem") === "sistema")).toBe(true);
    await expect(page.getByTestId("audit-entry")).toHaveCount(1);

    await page.getByTestId("audit-search").fill("TDV2E99");
    await expect.poll(() => requests.some((url) => url.searchParams.get("q") === "TDV2E99")).toBe(true);

    await page.getByTestId("audit-filter-tabela").selectOption("documentos");
    await expect.poll(() => requests.some((url) => url.searchParams.get("tabela") === "documentos")).toBe(true);
    await expect(page).toHaveURL(/\/auditoria\?.*tabela=documentos/);

    await page.getByTestId("audit-clear").click();
    await expect(page).toHaveURL(/\/auditoria$/);
  });

  test("histórico do registro filtra pela tabela + chave", async ({ page }) => {
    const requests = await openAudit(page);
    await page.getByTestId("audit-entry").last().getByTestId("audit-history").click();
    await expect
      .poll(() => requests.some((url) => url.searchParams.get("tabela") === "carros" && url.searchParams.get("pk") === "5460983a-1737-4326-8030-e03c63259c8a"))
      .toBe(true);
  });

  test("celular: filtros e linha do tempo cabem sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAudit(page);
    await expect(page.getByTestId("audit-entry").first()).toBeVisible();
    const overflow = await page.getByTestId("audit-explorer").evaluate((element) => {
      const root = element.getBoundingClientRect();
      const offenders = Array.from(element.querySelectorAll<HTMLElement>("*"))
        .filter((child) => {
          const box = child.getBoundingClientRect();
          return box.width > 0 && (box.right > root.right + 1 || box.left < root.left - 1);
        })
        .map((child) => child.className || child.tagName);
      return { pageScroll: document.documentElement.scrollWidth > window.innerWidth, offenders: offenders.slice(0, 5) };
    });
    expect(overflow.pageScroll).toBe(false);
    expect(overflow.offenders).toEqual([]);
  });
});
