import { expect, test, type Page } from "@playwright/test";

const PLAYGROUND_STORAGE_KEY = "rn-gestor.playground.v1.administrador@rn-gestor.local";

function createWorkbook() {
  const now = new Date().toISOString();

  return {
    version: 2,
    activePageId: "page-e2e",
    preferences: {
      showGridLines: true,
      printMargin: "compact"
    },
    pages: [
      {
        id: "page-e2e",
        name: "Pagina E2E",
        rowCount: 80,
        colCount: 26,
        cells: {},
        rowHeights: {},
        columnWidths: {},
        hiddenRows: {},
        hiddenColumns: {},
        updatedAt: now,
        feeds: [
          {
            id: "feed-a",
            table: "carros",
            position: { row: 4, col: 2 },
            targetRow: 4,
            targetCol: 2,
            columns: ["placa", "local", "modelo_id"],
            columnLabels: {
              placa: "Placa",
              local: "Loja",
              modelo_id: "Modelo"
            },
            query: {
              query: "",
              matchMode: "contains",
              filters: {},
              sort: [],
              page: 1,
              pageSize: 5
            },
            displayColumnOverrides: {},
            anchorFilterColumns: [] as string[],
            fragments: [],
            renderedAt: now
          },
          {
            id: "feed-b",
            table: "carros",
            position: { row: 4, col: 6 },
            targetRow: 4,
            targetCol: 6,
            columns: ["placa", "local"],
            columnLabels: {
              placa: "Placa",
              local: "Loja"
            },
            query: {
              query: "",
              matchMode: "contains",
              filters: {},
              sort: [],
              page: 1,
              pageSize: 5
            },
            displayColumnOverrides: {},
            anchorFilterColumns: [] as string[],
            fragments: [],
            renderedAt: now
          }
        ]
      }
    ]
  };
}

async function installPlaygroundRoutes(page: import("@playwright/test").Page) {
  let expandedRows = false;

  await page.route("**/api/v1/grid/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const column = url.searchParams.get("column") ?? "placa";
    const table = url.pathname.split("/").at(-1) === "facets" ? url.pathname.split("/").at(-2) : url.pathname.split("/").at(-1);

    if (url.pathname.endsWith("/facets")) {
      const options =
        column === "local"
          ? [
              { literal: "Loja 1", label: "Loja 1", count: 1 },
              { literal: "Loja 2", label: "Loja 2", count: 1 }
            ]
          : [
              { literal: "AAA1A11", label: "AAA1A11", count: 1 },
              { literal: "BBB2B22", label: "BBB2B22", count: 1 }
            ];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            table,
            column,
            options
          }
        })
      });
      return;
    }

    if (table === "modelos") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            table: "modelos",
            label: "Modelos",
            header: ["id", "nome"],
            rows: [{ id: "modelo-1", nome: "Civic" }],
            totalRows: 1,
            page: 1,
            pageSize: 1000,
            sort: [],
            filters: {}
          }
        })
      });
      return;
    }

    const baseCarRows = expandedRows
      ? [
          { id: "car-1", placa: "AAA1A11", local: "Loja 1", modelo_id: "modelo-1" },
          { id: "car-2", placa: "BBB2B22", local: "Loja 2", modelo_id: "modelo-1" },
          { id: "car-3", placa: "CCC3C33", local: "Loja 3", modelo_id: "modelo-1" },
          { id: "car-4", placa: "DDD4D44", local: "Loja 4", modelo_id: "modelo-1" }
        ]
      : [
        { id: "car-1", placa: "AAA1A11", local: "Loja 1", modelo_id: "modelo-1" },
        { id: "car-2", placa: "BBB2B22", local: "Loja 2", modelo_id: "modelo-1" }
      ];
    const filters = JSON.parse(url.searchParams.get("filters") ?? "{}") as Record<string, string>;
    const carRows = baseCarRows.filter((row) => {
      return Object.entries(filters).every(([filterColumn, expression]) => {
        const value = String(row[filterColumn as keyof typeof row] ?? "");
        if (expression.startsWith("=")) return value === expression.slice(1);
        if (expression.startsWith("EXCETO ")) {
          const blocked = expression.slice("EXCETO ".length).split("|");
          return !blocked.includes(value);
        }
        return true;
      });
    });
    const requestPage = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const requestPageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? 5));
    const from = (requestPage - 1) * requestPageSize;
    const pagedRows = carRows.slice(from, from + requestPageSize);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          table: "carros",
          label: "Carros",
          header: ["id", "placa", "local", "modelo_id"],
          rows: pagedRows,
          totalRows: carRows.length,
          page: requestPage,
          pageSize: requestPageSize,
          sort: [],
          filters: {}
        }
      })
    });
  });

  return {
    expandRows() {
      expandedRows = true;
    }
  };
}

async function openPlayground(page: import("@playwright/test").Page, workbook = createWorkbook()) {
  await page.addInitScript(
    ([key, workbook]) => {
      window.localStorage.setItem(key, JSON.stringify(workbook));
    },
    [PLAYGROUND_STORAGE_KEY, workbook] as const
  );

  await page.goto(`/login?next=${encodeURIComponent("/playground")}`, { waitUntil: "domcontentloaded" });

  const authPanel = page.getByTestId("auth-dev-panel");
  await expect(authPanel).toBeVisible();
  await page.getByTestId("auth-dev-role").selectOption("ADMINISTRADOR");
  await page.getByTestId("auth-dev-submit").click();

  const grid = page.getByTestId("playground-grid-scroll");
  await expect(grid).toBeVisible();
}

async function installPrintCapture(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture = {
      html: "",
      printed: false
    };

    window.open = (() => {
      return {
        document: {
          open() {},
          write(html: string) {
            (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.html = html;
          },
          close() {}
        },
        focus() {},
        print() {
          (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed = true;
        }
      } as Window;
    }) as typeof window.open;
  });
}

test("playground redimensiona e autoajusta toda a planilha apos selecionar All", async ({ page }) => {
  await installPlaygroundRoutes(page);
  const workbook = createWorkbook();
  workbook.pages[0].cells = {
    "2:0": { value: "linha 1\nlinha 2\nlinha 3" }
  };

  await openPlayground(page, workbook);
  await page.getByTestId("playground-select-all").click();

  const columnResizer = page.getByTestId("playground-col-resizer-0");
  const columnBox = await columnResizer.boundingBox();
  if (!columnBox) throw new Error("Resize da coluna A nao encontrado.");

  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + columnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2 + 40, columnBox.y + columnBox.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const widths = workbook.pages?.[0]?.columnWidths ?? {};
        return `${widths["0"]}:${widths["1"]}:${widths["25"]}`;
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe("152:152:152");

  const rowResizer = page.getByTestId("playground-row-resizer-0");
  const rowBox = await rowResizer.boundingBox();
  if (!rowBox) throw new Error("Resize da linha 1 nao encontrado.");

  await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2 + 18, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const heights = workbook.pages?.[0]?.rowHeights ?? {};
        return `${heights["0"]}:${heights["1"]}:${heights["79"]}`;
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe("48:48:48");

  await page.getByTestId("playground-col-resizer-2").dblclick();
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const widths = workbook.pages?.[0]?.columnWidths ?? {};
        return {
          manual: widths["0"],
          blank: widths["1"],
          fed: widths["2"]
        };
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toEqual({ manual: 80, blank: 56, fed: 80 });

  await page.getByTestId("playground-row-resizer-2").dblclick();
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const heights = workbook.pages?.[0]?.rowHeights ?? {};
        return {
          defaultRow: heights["0"],
          multilineRow: heights["2"]
        };
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toEqual({ defaultRow: 30, multilineRow: 70 });
});

test("playground cria, move e remove fragmento de alimentador", async ({ page }) => {
  await installPlaygroundRoutes(page);
  await openPlayground(page);

  await page.getByTestId("playground-cell-4-2").hover();
  await page.getByTestId("playground-feed-menu-feed-a").click();
  await page.getByTestId("playground-feed-fragment-feed-a").click();
  await expect(page.getByTestId("playground-fragment-dialog")).toBeVisible();

  await page.getByTestId("playground-fragment-column-feed-a").selectOption("local");
  await page.getByTestId("playground-fragment-option-feed-a-local-loja-1").check();
  await page.getByTestId("playground-fragment-apply-feed-a").click();

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        const fragment = feed?.fragments?.[0];
        return fragment
          ? {
              id: fragment.id,
              row: fragment.position.row,
              col: fragment.position.col,
              parentRow: feed.position.row,
              parentCol: feed.position.col
            }
          : null;
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toMatchObject({
      id: "fragment-feed-a-local-loja-1",
      parentRow: 4,
      parentCol: 2
    });

  const fragmentState = await page.evaluate((key) => {
    const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
    const fragment = feed?.fragments?.[0];
    return {
      id: fragment.id as string,
      row: fragment.position.row as number,
      col: fragment.position.col as number
    };
  }, PLAYGROUND_STORAGE_KEY);

  await expect(page.getByTestId(`playground-feed-block-${fragmentState.id}`)).toBeVisible();
  await expect(page.getByTestId(`playground-cell-${fragmentState.row + 1}-${fragmentState.col}`)).toContainText("AAA1A11");
  await expect(page.getByTestId("playground-cell-5-2")).toContainText("BBB2B22");

  await page.getByTestId(`playground-cell-${fragmentState.row}-${fragmentState.col}`).hover();
  await page.getByTestId(`playground-feed-sort-${fragmentState.id}-placa`).click();
  await expect
    .poll(async () =>
      page.evaluate(
        ({ key, fragmentId }) => {
          const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
          const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
          const fragment = feed?.fragments?.find((item: { id: string }) => item.id === fragmentId);
          return {
            parentSort: feed?.query?.sort?.length ?? -1,
            fragmentSort: fragment?.query?.sort?.[0] ? `${fragment.query.sort[0].column}:${fragment.query.sort[0].dir}` : ""
          };
        },
        { key: PLAYGROUND_STORAGE_KEY, fragmentId: fragmentState.id }
      )
    )
    .toEqual({ parentSort: 0, fragmentSort: "placa:asc" });

  await page.getByTestId(`playground-cell-${fragmentState.row}-${fragmentState.col}`).hover();
  await page.getByTestId(`playground-feed-filter-${fragmentState.id}-placa`).click();
  await expect(page.getByTestId(`playground-feed-filter-popover-${fragmentState.id}-placa`)).toBeVisible();
  await page.getByTestId(`playground-feed-filter-option-${fragmentState.id}-placa-aaa1a11`).check();
  await page.getByTestId(`playground-feed-filter-apply-${fragmentState.id}-placa`).click();
  await expect
    .poll(async () =>
      page.evaluate(
        ({ key, fragmentId }) => {
          const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
          const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
          const fragment = feed?.fragments?.find((item: { id: string }) => item.id === fragmentId);
          return {
            parentPlaca: feed?.query?.filters?.placa ?? "",
            parentLocal: feed?.query?.filters?.local ?? "",
            fragmentPlaca: fragment?.query?.filters?.placa ?? "",
            fragmentLocal: fragment?.query?.filters?.local ?? ""
          };
        },
        { key: PLAYGROUND_STORAGE_KEY, fragmentId: fragmentState.id }
      )
    )
    .toEqual({
      parentPlaca: "",
      parentLocal: "",
      fragmentPlaca: "=AAA1A11",
      fragmentLocal: "=Loja 1"
    });

  await page.getByTestId(`playground-cell-${fragmentState.row}-${fragmentState.col}`).hover();
  await page.getByTestId(`playground-feed-active-filters-${fragmentState.id}`).click();
  await expect(page.getByTestId("playground-active-filters-dialog")).toBeVisible();
  await page.getByTestId(`playground-active-filter-option-${fragmentState.id}-placa`).click();
  await expect
    .poll(async () =>
      page.evaluate(
        ({ key, fragmentId }) => {
          const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
          const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
          const fragment = feed?.fragments?.find((item: { id: string }) => item.id === fragmentId);
          return {
            parentPlaca: feed?.query?.filters?.placa ?? "",
            fragmentPlaca: fragment?.query?.filters?.placa ?? "",
            fragmentLocal: fragment?.query?.filters?.local ?? ""
          };
        },
        { key: PLAYGROUND_STORAGE_KEY, fragmentId: fragmentState.id }
      )
    )
    .toEqual({
      parentPlaca: "",
      fragmentPlaca: "",
      fragmentLocal: "=Loja 1"
    });

  await page.getByTitle("Alimentadores").click();
  await expect(page.getByTestId("playground-feed-dialog")).toBeVisible();
  await page.getByTestId("playground-feed-title-input").fill("Carros Loja");
  await page.getByRole("button", { name: "Salvar aqui" }).click();
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return feed?.title ?? "";
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe("Carros Loja");

  await page.getByTitle("Alimentadores").click();
  await page.getByTestId(`playground-feed-hub-fragment-${fragmentState.id}`).click();
  await page.getByTestId(`playground-feed-fragment-title-${fragmentState.id}`).fill("Somente Loja 1");
  await page.getByTestId(`playground-feed-fragment-column-toggle-${fragmentState.id}-local`).uncheck();
  await page.getByTestId(`playground-feed-fragment-relation-expand-${fragmentState.id}-modelo_id`).click();
  await expect(page.getByTestId("playground-feed-relation-dialog")).toBeVisible();
  await page.getByTestId(`playground-feed-relation-option-${fragmentState.id}-modelo_id-nome`).click();
  await page.getByTestId("playground-feed-dialog").getByRole("button", { name: "Fechar" }).last().click();
  await expect
    .poll(async () =>
      page.evaluate(
        ({ key, fragmentId }) => {
          const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
          const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
          const fragment = feed?.fragments?.find((item: { id: string }) => item.id === fragmentId);
          return {
            label: fragment?.valueLabel ?? "",
            columns: fragment?.columns ?? [],
            display: fragment?.displayColumnOverrides?.modelo_id ?? ""
          };
        },
        { key: PLAYGROUND_STORAGE_KEY, fragmentId: fragmentState.id }
      )
    )
    .toEqual({
      label: "Somente Loja 1",
      columns: ["placa", "modelo_id"],
      display: "nome"
    });

  const dragHandle = page.getByTestId(`playground-feed-drag-${fragmentState.id}`);
  await page.getByTestId(`playground-cell-${fragmentState.row + 1}-${fragmentState.col}`).hover();
  const handleBox = await dragHandle.boundingBox();
  if (!handleBox) throw new Error("Handle do fragmento nao encontrado.");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 250, handleBox.y + handleBox.height / 2 + 90, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate(
        ({ key, fragmentId }) => {
          const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
          const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
          const fragment = feed?.fragments?.find((item: { id: string }) => item.id === fragmentId);
          return fragment
            ? {
                fragment: `${fragment.position.row}:${fragment.position.col}`,
                parent: `${feed.position.row}:${feed.position.col}`
              }
            : null;
        },
        { key: PLAYGROUND_STORAGE_KEY, fragmentId: fragmentState.id }
      )
    )
    .not.toMatchObject({
      fragment: `${fragmentState.row}:${fragmentState.col}`
    });

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return `${feed.position.row}:${feed.position.col}`;
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe("4:2");

  const movedFragmentState = await page.evaluate(
    ({ key, fragmentId }) => {
      const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
      const fragment = feed?.fragments?.find((item: { id: string }) => item.id === fragmentId);
      return {
        row: fragment.position.row as number,
        col: fragment.position.col as number
      };
    },
    { key: PLAYGROUND_STORAGE_KEY, fragmentId: fragmentState.id }
  );

  await page.getByTestId(`playground-cell-${movedFragmentState.row + 1}-${movedFragmentState.col}`).hover();
  await page.getByTestId(`playground-feed-menu-${fragmentState.id}`).click();
  await page.getByTestId(`playground-feed-remove-fragment-${fragmentState.id}`).click();

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return feed?.fragments?.length ?? -1;
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe(0);
});

test("playground reconfigura alimentador com paginacao no header e ancora durante scroll", async ({ page }) => {
  await installPlaygroundRoutes(page);
  await openPlayground(page);

  await page.getByTestId("playground-cell-4-2").hover();
  await page.getByTestId("playground-feed-menu-feed-a").click();
  await page.getByTestId("playground-feed-edit-feed-a").click();
  await expect(page.getByTestId("playground-feed-dialog")).toBeVisible();
  await expect(page.getByTestId("playground-feed-hub-card-feed-a")).toHaveClass(/is-active/);
  await expect(page.getByTestId("playground-feed-page-size-input")).toHaveValue("5");

  await page.getByTestId("playground-feed-page-size-input").fill("1");
  await page.getByTestId("playground-feed-header-pagination-toggle").check();
  await page.getByRole("button", { name: "Salvar aqui" }).click();
  await expect(page.getByTestId("playground-feed-dialog")).toBeHidden();

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return {
          pageSize: feed?.query?.pageSize,
          showPaginationInHeader: feed?.showPaginationInHeader
        };
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toEqual({ pageSize: 1, showPaginationInHeader: true });

  await page.getByTestId("playground-cell-4-2").hover();
  await expect(page.getByTestId("playground-feed-header-pager-feed-a")).toBeVisible();
  await expect(page.getByTestId("playground-feed-page-input-feed-a")).toHaveValue("1/2");
  await page.getByTestId("playground-feed-page-next-feed-a").click();
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return feed?.query?.page ?? 0;
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe(2);
  await expect(page.getByTestId("playground-feed-page-input-feed-a")).toHaveValue("2/2");
  await page.getByTestId("playground-feed-page-input-feed-a").fill("1/2");
  await page.getByTestId("playground-feed-page-input-feed-a").press("Enter");
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return feed?.query?.page ?? 0;
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe(1);

  const grid = page.getByTestId("playground-grid-scroll");
  await grid.evaluate((node) => {
    node.scrollTop = 130;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  const pinnedHeader = page.getByTestId("playground-feed-header-feed-a");
  await expect(pinnedHeader).toHaveClass(/is-pinned/);
  await expect(page.locator(".playground-feed-block-header.is-pinned")).toHaveCount(1);

  const gridBox = await grid.boundingBox();
  const headerBox = await pinnedHeader.boundingBox();
  if (!gridBox || !headerBox) throw new Error("Header fixo do alimentador nao encontrado.");
  expect(Math.abs(headerBox.y - (gridBox.y + 40))).toBeLessThan(8);
});

test("playground fixa filtros do alimentador e permite desancorar no hub", async ({ page }) => {
  await installPlaygroundRoutes(page);
  const workbook = createWorkbook();
  const feed = workbook.pages[0].feeds[0];
  feed.query.filters = { local: "=Loja 1" };
  feed.anchorFilterColumns = ["local"];

  await openPlayground(page, workbook);
  await expect(page.getByTestId("playground-cell-5-2")).toContainText("AAA1A11");
  await expect(page.getByTestId("playground-cell-6-2")).not.toContainText("BBB2B22");

  await page.getByTestId("playground-cell-4-3").hover();
  await expect(page.getByTestId("playground-feed-filter-feed-a-local")).toBeDisabled();
  await expect(page.getByTestId("playground-feed-active-filters-feed-a")).toHaveCount(0);

  await page.getByTestId("playground-feed-menu-feed-a").click();
  await page.getByTestId("playground-feed-edit-feed-a").click();
  await expect(page.getByTestId("playground-anchor-filter-toggle-feed-a-local")).toBeChecked();
  await page.getByTestId("playground-anchor-filter-toggle-feed-a-local").uncheck();
  await page.getByRole("button", { name: "Salvar aqui" }).click();

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const savedFeed = saved.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return (savedFeed?.anchorFilterColumns ?? []).join(",");
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe("");

  await expect(page.getByTestId("playground-feed-filter-feed-a-local")).toBeEnabled();
  await expect(page.getByTestId("playground-feed-active-filters-feed-a")).toBeVisible();
});

test("playground arrasta alimentador com snap sem sobrepor outro bloco", async ({ page }) => {
  const routes = await installPlaygroundRoutes(page);
  await openPlayground(page);

  const firstBlock = page.getByTestId("playground-feed-block-feed-a");
  const secondBlock = page.getByTestId("playground-feed-block-feed-b");
  await expect(firstBlock).toBeVisible();
  await expect(secondBlock).toBeVisible();
  const fedCell = page.getByTestId("playground-cell-5-2");
  await expect(fedCell).toContainText("AAA1A11");
  await fedCell.click();
  await expect(fedCell).toHaveClass(/is-selected/);

  await page.getByTestId("playground-cell-4-2").hover();
  await page.getByTestId("playground-feed-sort-feed-a-placa").click();
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        const rule = feed?.query?.sort?.[0];
        return rule ? `${rule.column}:${rule.dir}` : "";
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe("placa:asc");

  await page.getByTestId("playground-cell-4-2").hover();
  await page.getByTestId("playground-feed-filter-feed-a-placa").click();
  await expect(page.getByTestId("playground-feed-filter-popover-feed-a-placa")).toBeVisible();
  await page.getByTestId("playground-feed-filter-option-feed-a-placa-aaa1a11").check();
  await page.getByTestId("playground-feed-filter-apply-feed-a-placa").click();
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return feed?.query?.filters?.placa ?? "";
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe("=AAA1A11");

  await page.getByTestId("playground-cell-4-4").hover();
  await page.getByTestId("playground-feed-filter-feed-a-modelo_id").click();
  await page.getByTestId("playground-feed-relation-expand-feed-a-modelo_id").click();
  await expect(page.getByTestId("playground-feed-relation-dialog")).toBeVisible();
  await page.getByTestId("playground-feed-relation-option-feed-a-modelo_id-nome").click();
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return feed?.displayColumnOverrides?.modelo_id ?? "";
      }, PLAYGROUND_STORAGE_KEY)
    )
    .toBe("nome");
  await expect(page.getByTestId("playground-cell-5-4")).toContainText("Civic");

  routes.expandRows();
  await page.getByTitle("Atualizar dados").click();
  await expect(page.getByTestId("playground-area-resize-dialog")).toBeVisible();
  await expect(page.getByTestId(/playground-area-resize-preview-/)).toBeVisible();
  await page.getByRole("button", { name: "Aplicar preview" }).click();
  await expect(page.getByTestId("playground-area-resize-dialog")).toBeHidden();

  const firstBefore = await firstBlock.boundingBox();
  if (!firstBefore) throw new Error("Bloco feed-a nao encontrado antes do drag.");

  const dragHandle = page.getByTestId("playground-feed-drag-feed-a");
  const handleBox = await dragHandle.boundingBox();
  if (!handleBox) throw new Error("Handle de drag do feed-a nao encontrado.");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 540, handleBox.y + handleBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const saved = await page.evaluate((key) => {
        const workbook = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        const feed = workbook.pages?.[0]?.feeds?.find((item: { id: string }) => item.id === "feed-a");
        return feed ? `${feed.targetRow}:${feed.targetCol}` : "";
      }, PLAYGROUND_STORAGE_KEY);

      return saved;
    })
    .not.toBe("4:2");

  const firstAfter = await firstBlock.boundingBox();
  const secondAfter = await secondBlock.boundingBox();
  if (!firstAfter || !secondAfter) throw new Error("Blocos nao encontrados apos drag.");

  const overlaps =
    firstAfter.x < secondAfter.x + secondAfter.width &&
    firstAfter.x + firstAfter.width > secondAfter.x &&
    firstAfter.y < secondAfter.y + secondAfter.height &&
    firstAfter.y + firstAfter.height > secondAfter.y;

  expect(overlaps).toBe(false);
});

test("playground abre configuracao de impressao com preview e indices opcionais", async ({ page }) => {
  await installPrintCapture(page);
  await installPlaygroundRoutes(page);
  const workbook = createWorkbook();
  workbook.pages[0].cells = {
    "0:0": { value: "Manual A1" }
  };

  await openPlayground(page, workbook);

  await page.getByTitle("Imprimir pagina").click();
  await expect(page.getByTestId("playground-print-dialog")).toBeVisible();
  await expect(page.getByTestId("playground-print-preview")).toContainText("Manual A1");
  await expect(page.getByTestId("playground-print-preview").locator("thead")).toHaveCount(0);
  await expect(page.getByTestId("playground-print-sheet-indexes")).not.toBeChecked();
  await page.getByTestId("playground-print-submit").click();

  await page.waitForFunction(() => {
    return (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed;
  });

  let capture = await page.evaluate(() => (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture);
  expect(capture.html).toContain("Manual A1");
  expect(capture.html).not.toContain("<th>A</th>");
  expect(capture.html).not.toContain("<th>1</th>");

  await page.evaluate(() => {
    (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture = {
      html: "",
      printed: false
    };
  });

  await page.getByTitle("Imprimir pagina").click();
  await page.getByTestId("playground-print-sheet-indexes").check();
  await expect(page.getByTestId("playground-print-preview").locator("thead")).toBeVisible();
  await page.getByTestId("playground-print-submit").click();

  await page.waitForFunction(() => {
    return (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture.printed;
  });

  capture = await page.evaluate(() => (window as unknown as { __printCapture: { html: string; printed: boolean } }).__printCapture);
  expect(capture.html).toContain("<th>A</th>");
  // Index header cells now carry an inline height to keep printer pages
  // aligned with the in-grid page-break marker, so allow optional attributes.
  expect(capture.html).toMatch(/<th(?:\s[^>]*)?>1<\/th>/);
});
