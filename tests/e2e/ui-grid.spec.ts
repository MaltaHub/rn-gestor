import { expect, test } from "@playwright/test";

type SheetKey = "carros" | "anuncios" | "modelos" | "grupos_repetidos" | "repetidos";

type Row = Record<string, unknown>;

type GridState = Record<SheetKey, Row[]>;

const tableConfig = {
  carros: {
    pk: "id",
    label: "Carros",
    header: [
      "id",
      "placa",
      "nome",
      "modelo_id",
      "local",
      "estado_venda",
      "estado_anuncio",
      "estado_veiculo",
      "em_estoque",
      "cor",
      "ano_fab",
      "ano_mod",
      "hodometro",
      "preco_original",
      "created_at",
      "updated_at"
    ]
  },
  anuncios: {
    pk: "id",
    label: "Anuncios",
    header: ["id", "target_id", "estado_anuncio", "valor_anuncio", "created_at", "updated_at"]
  },
  modelos: {
    pk: "id",
    label: "Modelos",
    header: ["id", "modelo", "created_at", "updated_at"]
  },
  grupos_repetidos: {
    pk: "grupo_id",
    label: "Repetidos Grupos",
    header: [
      "grupo_id",
      "modelo_id",
      "cor",
      "ano_mod",
      "preco_original",
      "preco_min",
      "preco_max",
      "hodometro_min",
      "hodometro_max",
      "qtde",
      "atualizado_em",
      "created_at",
      "updated_at"
    ]
  },
  repetidos: {
    pk: "carro_id",
    label: "Repetidos",
    header: ["carro_id", "grupo_id", "created_at", "updated_at"]
  }
} as const;

function nowIso(offset = 0) {
  return new Date(Date.now() + offset).toISOString();
}

function initialState(): GridState {
  return {
    modelos: [
      { id: "mod-1", modelo: "Civic Touring", created_at: nowIso(-40_000), updated_at: nowIso(-35_000) },
      { id: "mod-2", modelo: "Corolla XEi", created_at: nowIso(-30_000), updated_at: nowIso(-30_000) }
    ],
    carros: [
      {
        id: "car-1",
        placa: "ABC1234",
        nome: "Carro QA 1",
        modelo_id: "mod-1",
        local: "loja_centro",
        estado_venda: "disponivel",
        estado_anuncio: "publicado",
        estado_veiculo: "novo",
        em_estoque: true,
        cor: "preto",
        ano_fab: 2024,
        ano_mod: 2024,
        hodometro: 1200,
        preco_original: 152000,
        created_at: nowIso(-80_000),
        updated_at: nowIso(-80_000)
      },
      {
        id: "car-2",
        placa: "XYZ9988",
        nome: "Carro QA 2",
        modelo_id: "mod-2",
        local: "loja_norte",
        estado_venda: "disponivel",
        estado_anuncio: "rascunho",
        estado_veiculo: "seminovo",
        em_estoque: true,
        cor: "branco",
        ano_fab: 2023,
        ano_mod: 2023,
        hodometro: 28000,
        preco_original: 126500,
        created_at: nowIso(-60_000),
        updated_at: nowIso(-60_000)
      }
    ],
    anuncios: [
      {
        id: "ad-1",
        target_id: "car-1",
        estado_anuncio: "publicado",
        valor_anuncio: 155900,
        created_at: nowIso(-45_000),
        updated_at: nowIso(-45_000)
      }
    ],
    grupos_repetidos: [
      {
        grupo_id: "grp-1",
        modelo_id: "mod-1",
        cor: "preto",
        ano_mod: 2024,
        preco_original: 152000,
        preco_min: 150000,
        preco_max: 152000,
        hodometro_min: 1000,
        hodometro_max: 1800,
        qtde: 2,
        atualizado_em: nowIso(-10_000),
        created_at: nowIso(-10_000),
        updated_at: nowIso(-10_000)
      }
    ],
    repetidos: [
      { carro_id: "car-1", grupo_id: "grp-1", created_at: nowIso(-10_000), updated_at: nowIso(-10_000) },
      { carro_id: "car-2", grupo_id: "grp-1", created_at: nowIso(-10_000), updated_at: nowIso(-10_000) }
    ]
  };
}

function parseFilters(raw: string | null): Record<string, string> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }

    return out;
  } catch {
    return {};
  }
}

function parseSort(raw: string | null): Array<{ column: string; dir: "asc" | "desc" }> {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Array<{ column?: string; dir?: string }>;
    return parsed
      .filter((item) => typeof item.column === "string" && (item.dir === "asc" || item.dir === "desc"))
      .map((item) => ({ column: item.column as string, dir: item.dir as "asc" | "desc" }));
  } catch {
    return [];
  }
}

function compareValue(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;

  if (typeof a === "number" && typeof b === "number") return a - b;

  return String(a).localeCompare(String(b));
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = initialState();

  await page.route("**/api/v1/lookups", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user_roles: [
            { code: "VENDEDOR", name: "Vendedor" },
            { code: "SECRETARIO", name: "Secretario" },
            { code: "GERENTE", name: "Gerente" },
            { code: "ADMINISTRADOR", name: "Administrador" }
          ],
          user_statuses: [{ code: "ativo", name: "Ativo" }],
          sale_statuses: [
            { code: "disponivel", name: "Disponivel" },
            { code: "vendido", name: "Vendido" }
          ],
          announcement_statuses: [
            { code: "publicado", name: "Publicado" },
            { code: "rascunho", name: "Rascunho" }
          ],
          locations: [
            { code: "loja_centro", name: "Loja Centro" },
            { code: "loja_norte", name: "Loja Norte" }
          ],
          vehicle_states: [
            { code: "novo", name: "Novo" },
            { code: "seminovo", name: "Seminovo" }
          ]
        }
      })
    });
  });

  await page.route("**/api/v1/repetidos/rebuild", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    state.grupos_repetidos = [
      {
        grupo_id: "grp-rebuild",
        modelo_id: "mod-1",
        cor: "preto",
        ano_mod: 2024,
        preco_original: 152000,
        preco_min: 150000,
        preco_max: 152000,
        hodometro_min: 1000,
        hodometro_max: 1800,
        qtde: 2,
        atualizado_em: nowIso(),
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];

    state.repetidos = state.carros.slice(0, 2).map((car) => ({
      carro_id: String(car.id),
      grupo_id: "grp-rebuild",
      created_at: nowIso(),
      updated_at: nowIso()
    }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { grupos_repetidos: state.grupos_repetidos.length, registros_repetidos: state.repetidos.length } })
    });
  });

  await page.route("**/api/v1/finalizados/*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const id = url.pathname.split("/").pop() as string;
    const car = state.carros.find((row) => String(row.id) === id);

    if (!car) {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: { message: "Nao encontrado" } }) });
      return;
    }

    car.em_estoque = false;
    car.estado_venda = "vendido";
    car.updated_at = nowIso();

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { finalizado: { id }, carro: car } })
    });
  });

  await page.route("**/api/v1/grid/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((part) => part === "grid");

    if (idx === -1) {
      await route.fallback();
      return;
    }

    const table = parts[idx + 1] as SheetKey | undefined;
    const id = parts[idx + 2];

    if (!table || !(table in state)) {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: { message: "Tabela nao suportada" } }) });
      return;
    }

    const config = tableConfig[table];

    if (request.method() === "GET") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      const filters = parseFilters(url.searchParams.get("filters"));
      const sort = parseSort(url.searchParams.get("sort"));

      let rows = [...state[table]];

      if (query) {
        rows = rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query)));
      }

      for (const [column, expressionRaw] of Object.entries(filters)) {
        const expression = expressionRaw.trim();
        if (!expression) continue;

        if (expression.includes("|")) {
          const allowed = new Set(
            expression
              .split("|")
              .map((item) => item.trim().toLowerCase())
              .filter(Boolean)
          );
          rows = rows.filter((row) => allowed.has(String(row[column] ?? "").toLowerCase()));
          continue;
        }

        if (expression.startsWith("=")) {
          const target = expression.slice(1).trim().toLowerCase();
          rows = rows.filter((row) => String(row[column] ?? "").toLowerCase() === target);
          continue;
        }

        rows = rows.filter((row) => String(row[column] ?? "").toLowerCase().includes(expression.toLowerCase()));
      }

      const sortChain = sort.length > 0 ? sort : [{ column: config.header[0], dir: "asc" as const }];
      rows.sort((a, b) => {
        for (const rule of sortChain) {
          const comparison = compareValue(a[rule.column], b[rule.column]);
          if (comparison !== 0) {
            return rule.dir === "asc" ? comparison : -comparison;
          }
        }
        return 0;
      });

      const totalRows = rows.length;
      const from = (page - 1) * pageSize;
      const paged = rows.slice(from, from + pageSize);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            table,
            label: config.label,
            header: config.header,
            rows: paged,
            totalRows,
            page,
            pageSize,
            sort: sortChain,
            filters
          }
        })
      });
      return;
    }

    if (request.method() === "POST") {
      const body = (request.postDataJSON() as { row?: Row }) ?? {};
      const row = body.row ?? {};
      const pk = config.pk;
      const pkValue = row[pk];

      if (typeof pkValue === "string" && pkValue.length > 0) {
        const index = state[table].findIndex((item) => String(item[pk]) === pkValue);
        if (index >= 0) {
          state[table][index] = {
            ...state[table][index],
            ...row,
            updated_at: nowIso()
          };
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { operation: "update", row: state[table][index] } })
        });
        return;
      }

      const newId = `${table.slice(0, 3)}-${Math.floor(Math.random() * 1000000)}`;
      const newRow = {
        ...row,
        [pk]: newId,
        created_at: nowIso(),
        updated_at: nowIso()
      };

      state[table].push(newRow);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { operation: "insert", row: newRow } })
      });
      return;
    }

    if (request.method() === "DELETE" && id) {
      state[table] = state[table].filter((item) => String(item[config.pk]) !== id);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { deleted: true, id } })
      });
      return;
    }

    await route.fulfill({ status: 405, body: JSON.stringify({ error: { message: "Metodo nao suportado" } }) });
  });
});

test("renderiza grid minimalista com controles iconicos e troca de sheet", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("holistic-sheet")).toBeVisible();
  await expect(page.getByTestId("action-reload")).toBeVisible();
  await expect(page.getByTestId("action-insert-row")).toBeVisible();
  await expect(page.getByTestId("action-rebuild-repetidos")).toBeVisible();
  await expect(page.getByRole("button", { name: "Inserir linha" })).toBeVisible();

  await page.getByTestId("sheet-tab-modelos").click();
  await expect(page.getByTestId("sheet-grid-table")).toContainText("Civic Touring");
  await expect(page.getByTestId("cell-modelos-0-modelo")).toBeVisible();
});

test("filtro por tooltip da coluna aplica dinamicamente", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");

  await page.getByTestId("filter-trigger-local").click();
  await expect(page.getByTestId("filter-popover-local")).toBeVisible();
  await page.getByTestId("filter-option-local-loja_centro").click();

  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).not.toContainText("XYZ9988");

  await page.getByTestId("filter-clear-local").click();
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");
});

test("filtros encadeados mostram apenas valores presentes no sheet atual", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("XYZ9988");

  await page.getByTestId("filter-trigger-local").click();
  await page.getByTestId("filter-option-local-loja_centro").click();
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");
  await expect(page.getByTestId("sheet-grid-table")).not.toContainText("XYZ9988");

  await page.getByTestId("filter-trigger-estado_anuncio").click();
  await expect(page.getByTestId("filter-option-estado_anuncio-publicado")).toBeVisible();
  await expect(page.getByTestId("filter-option-estado_anuncio-rascunho")).toHaveCount(0);
});

test("tooltip de filtro e renderizado fora do grid sem corte", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("filter-trigger-local").click();

  const isFixed = await page.evaluate(() => {
    const popover = document.querySelector('[data-testid="filter-popover-local"]') as HTMLElement | null;
    if (!popover) return false;
    return window.getComputedStyle(popover).position === "fixed";
  });

  expect(isFixed).toBe(true);
});

test("botao de filtro permanece visivel apos resize extremo da coluna", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");

  const handle = page.getByTestId("resize-handle-placa");
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Resize handle da coluna 'placa' nao encontrado.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 360, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId("filter-trigger-placa")).toBeVisible();
});

test("expansao manual de dados troca exibicao da coluna relacional", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cell-carros-0-modelo_id")).toContainText("mod-1");

  await page.getByTestId("filter-trigger-modelo_id").click();
  await page.getByTestId("relation-expand-modelo_id").click();

  await expect(page.getByTestId("relation-dialog")).toBeVisible();
  await page.getByTestId("relation-option-modelo_id-modelo").click();

  await expect(page.getByTestId("relation-dialog")).toHaveCount(0);
  await expect(page.getByTestId("cell-carros-0-modelo_id")).toContainText("Civic Touring");
  await expect(page.getByTestId("cell-carros-1-modelo_id")).toContainText("Corolla XEi");

  await page.getByTestId("filter-trigger-modelo_id").click();
  const popover = page.getByTestId("filter-popover-modelo_id");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Civic Touring");
  await expect(popover).toContainText("Corolla XEi");
  await expect(popover).not.toContainText("mod-1");
  await expect(popover).not.toContainText("mod-2");
});

test("ciclo de selecionar tudo alterna entre inverter e limpar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("row-check-car-1")).toBeVisible();
  await expect(page.getByTestId("row-check-car-2")).toBeVisible();

  await page.getByTestId("row-check-car-1").click();
  await expect(page.getByTestId("row-check-car-1")).toBeChecked();
  await expect(page.getByTestId("row-check-car-2")).not.toBeChecked();

  await page.getByTestId("action-select-cycle").click();
  await expect(page.getByTestId("row-check-car-1")).not.toBeChecked();
  await expect(page.getByTestId("row-check-car-2")).toBeChecked();

  await page.getByTestId("action-select-cycle").click();
  await expect(page.getByTestId("row-check-car-1")).not.toBeChecked();
  await expect(page.getByTestId("row-check-car-2")).not.toBeChecked();

  await page.getByTestId("action-select-cycle").click();
  await expect(page.getByTestId("row-check-car-1")).toBeChecked();
  await expect(page.getByTestId("row-check-car-2")).toBeChecked();
});

test("shift + setas expande selecao para multiplas celulas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cell-carros-0-id")).toBeVisible();

  await page.getByTestId("cell-carros-0-id").click();
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Shift");

  const selectedCount = await page.evaluate(() => document.querySelectorAll("td.is-selected-cell").length);
  expect(selectedCount).toBeGreaterThan(2);
});

test("ctrl+c copia selecao em formato csv", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cell-carros-0-id")).toBeVisible();

  await page.getByTestId("cell-carros-0-id").click();
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Shift");

  await page.keyboard.press("Control+c");
  const clipboard = await page.evaluate(async () => navigator.clipboard.readText());
  expect(clipboard).toContain("car-1,ABC1234");
  expect(clipboard).toContain("car-2,XYZ9988");
});

test("resize de coluna respeita limites minimo e maximo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");

  const widthBefore = await page.evaluate(() => {
    const col = document.querySelector(".sheet-grid colgroup col:nth-child(3)") as HTMLTableColElement | null;
    return col ? Number.parseFloat(col.style.width || "0") : 0;
  });

  const handle = page.getByTestId("resize-handle-placa");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Resize handle da coluna 'placa' nao encontrado.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 320, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  const widthAfterShrink = await page.evaluate(() => {
    const col = document.querySelector(".sheet-grid colgroup col:nth-child(3)") as HTMLTableColElement | null;
    return col ? Number.parseFloat(col.style.width || "0") : 0;
  });

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 520, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  const widthAfterGrow = await page.evaluate(() => {
    const col = document.querySelector(".sheet-grid colgroup col:nth-child(3)") as HTMLTableColElement | null;
    return col ? Number.parseFloat(col.style.width || "0") : 0;
  });

  expect(widthAfterShrink).toBeLessThanOrEqual(widthBefore);
  expect(widthAfterShrink).toBeGreaterThanOrEqual(20);
  expect(widthAfterGrow).toBeGreaterThanOrEqual(widthAfterShrink);
  expect(widthAfterGrow).toBeLessThanOrEqual(widthBefore);
});

test("navegacao por setas percorre multiplas celulas sem travar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sheet-grid-table")).toContainText("ABC1234");

  const firstCell = page.getByTestId("cell-carros-0-id");
  await firstCell.click();

  const selectedCell = page.locator("td.is-selected-cell").first();
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-id");

  await page.keyboard.press("ArrowRight");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-placa");

  await page.keyboard.press("ArrowRight");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-nome");

  await page.keyboard.press("ArrowRight");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-modelo_id");

  await page.keyboard.press("ArrowRight");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-0-local");

  await page.keyboard.press("ArrowDown");
  await expect(selectedCell).toHaveAttribute("data-testid", "cell-carros-1-local");
});

test("edicao inline persiste apos recarga", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sheet-tab-modelos").click();

  const cell = page.getByTestId("cell-modelos-0-modelo");
  await cell.dblclick();

  const editor = page.locator(".sheet-inline-editor");
  await editor.fill("Civic Touring QA");
  await editor.press("Enter");

  await expect(page.getByTestId("cell-modelos-0-modelo")).toContainText("Civic Touring QA");

  await page.getByTestId("action-reload").click();
  await expect(page.getByTestId("cell-modelos-0-modelo")).toContainText("Civic Touring QA");
});

test("insere e remove linha na planilha de modelos", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sheet-tab-modelos").click();

  await page.getByTestId("action-insert-row").click();
  const novaLinha = page.locator("tbody tr", { hasText: "NOVO MODELO" }).first();
  await expect(novaLinha).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());

  await novaLinha.locator('input[type="checkbox"]').click();
  await page.getByTestId("action-delete-rows").click();

  await expect(page.locator("tbody tr", { hasText: "NOVO MODELO" })).toHaveCount(0);
});

test("finaliza carro selecionado e atualiza estado logico", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("row-check-car-1").click();
  await page.getByTestId("action-finalize-rows").click();

  await expect(page.getByText("Nao")).toBeVisible();
  await expect(page.getByText("vendido")).toBeVisible();
});

test("executa rebuild de repetidos pela sheet", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sheet-tab-grupos_repetidos").click();

  await page.getByTestId("action-rebuild-repetidos").click();
  await expect(page.getByTestId("sheet-grid-table")).toContainText("grp-rebuild");
});
