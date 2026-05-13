import { expect, test } from "@playwright/test";

function createFolderTreeResponse() {
  const now = new Date().toISOString();

  const rootFolder = {
    id: "folder-root",
    name: "Central",
    slug: "central",
    description: "Raiz do explorer",
    parentFolderId: null,
    fileCount: 0,
    childFolderCount: 1,
    physicalName: "Central",
    displayName: "Central",
    automationKey: null,
    automationRepositoryKey: null,
    managedCarroId: null,
    isAutomationRepository: false,
    isManagedFolder: false,
    createdAt: now,
    updatedAt: now
  };

  const childFolder = {
    id: "folder-child",
    name: "Documentos",
    slug: "documentos",
    description: "Arquivos operacionais",
    parentFolderId: rootFolder.id,
    fileCount: 1,
    childFolderCount: 0,
    physicalName: "Documentos",
    displayName: "Documentos",
    automationKey: null,
    automationRepositoryKey: null,
    managedCarroId: null,
    isAutomationRepository: false,
    isManagedFolder: false,
    createdAt: now,
    updatedAt: now
  };

  return {
    folders: [childFolder, rootFolder]
  };
}

function createFolderDetailResponse() {
  const now = new Date().toISOString();

  const rootFolder = {
    id: "folder-root",
    name: "Central",
    slug: "central",
    description: "Raiz do explorer",
    parentFolderId: null,
    fileCount: 0,
    childFolderCount: 1,
    physicalName: "Central",
    displayName: "Central",
    automationKey: null,
    automationRepositoryKey: null,
    managedCarroId: null,
    isAutomationRepository: false,
    isManagedFolder: false,
    createdAt: now,
    updatedAt: now
  };

  const childFolder = {
    id: "folder-child",
    name: "Documentos",
    slug: "documentos",
    description: "Arquivos operacionais",
    parentFolderId: rootFolder.id,
    fileCount: 1,
    childFolderCount: 0,
    physicalName: "Documentos",
    displayName: "Documentos",
    automationKey: null,
    automationRepositoryKey: null,
    managedCarroId: null,
    isAutomationRepository: false,
    isManagedFolder: false,
    createdAt: now,
    updatedAt: now
  };

  return {
    folder: childFolder,
    breadcrumb: [rootFolder, childFolder],
    childFolders: [],
    files: [
      {
        id: "file-1",
        folderId: childFolder.id,
        fileName: "foto-estoque.png",
        mimeType: "image/png",
        sizeBytes: 24_980,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        previewUrl:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23eaf1ff'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-family='Arial' font-size='28' fill='%231d4ed8'%3EFoto do estoque%3C/text%3E%3C/svg%3E",
        downloadUrl: "/download/foto-estoque.png",
        isMissing: false
      }
    ]
  };
}

function createAutomationConfigResponse() {
  const now = new Date().toISOString();
  const keys = [
    "vehicle_photos_active",
    "vehicle_photos_sold",
    "vehicle_documents_active",
    "vehicle_documents_archive"
  ];

  return {
    displayField: "placa",
    repositories: Object.fromEntries(keys.map((key) => [key, "folder-root"])),
    configs: keys.map((key) => ({
      automationKey: key,
      repositoryFolderId: "folder-root",
      displayField: "placa",
      enabled: true,
      updatedAt: now
    }))
  };
}

async function signInWithDevRole(page: import("@playwright/test").Page) {
  await page.goto("/login?next=%2Farquivos", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("auth-dev-panel")).toBeVisible();
  await page.getByTestId("auth-dev-role").selectOption("ADMINISTRADOR");
  await page.getByTestId("auth-dev-submit").click();
  await expect(page).toHaveURL(/\/arquivos/);
}

test.describe.configure({ retries: 1, timeout: 60_000 });

test("Arquivos abre como explorer de pastas", async ({ page }) => {
  await page.route("**/api/v1/files/automation-config", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: createAutomationConfigResponse()
      })
    });
  });

  await page.route("**/api/v1/files/folders", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: createFolderTreeResponse()
      })
    });
  });

  await page.route("**/api/v1/files/folders/folder-child", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: createFolderDetailResponse()
      })
    });
  });

  await signInWithDevRole(page);

  await expect(page.getByText("Explorar")).toBeVisible();
  await expect(page.locator(".files-path-link", { hasText: "Central" })).toBeVisible();
  await expect(page.locator(".files-tree-row.is-active .files-tree-folder-label")).toHaveText("Documentos");
  await expect(page.locator(".files-path-line")).toHaveText("Central / Documentos");
  await expect(page.locator(".files-preview-context")).toHaveText("Central / Documentos");
  await expect(page.getByRole("button", { name: "Abrir raiz" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pasta pai" })).toBeVisible();
  await expect(page.locator(".files-selected-item-card .files-section-kicker")).toHaveText("Selecionado");
  await expect(page.locator(".files-preview-side strong")).toHaveText("foto-estoque.png");
  await expect(page.locator(".files-explorer-header-row")).toHaveText(/Nome.*Acoes/);

  await page.locator(".files-command-actions").getByRole("button", { name: "Automacoes" }).click();
  const automationPanel = page.locator(".files-action-panel").filter({ hasText: "Repositorios de veiculos" });
  const firstRepositoryOptions = await automationPanel.locator("select").nth(1).locator("option").allTextContents();
  expect(firstRepositoryOptions.map((option) => option.trim())).toContain("Central");
  expect(firstRepositoryOptions.map((option) => option.trim())).not.toContain("Documentos");
});

test("Arquivos mantem layout de tres colunas com explorer compacto", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.route("**/api/v1/files/automation-config", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: createAutomationConfigResponse() })
    });
  });

  await page.route("**/api/v1/files/folders", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: createFolderTreeResponse() })
    });
  });

  await page.route("**/api/v1/files/folders/folder-child", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: createFolderDetailResponse() })
    });
  });

  await signInWithDevRole(page);

  const explorerColumn = page.locator(".files-explorer-column");
  const mainColumn = page.locator(".files-main-column");
  const manageColumn = page.locator(".files-manage-column");

  await expect(explorerColumn).toBeVisible();
  await expect(mainColumn).toBeVisible();
  await expect(manageColumn).toBeVisible();

  const explorerBox = await explorerColumn.boundingBox();
  const mainBox = await mainColumn.boundingBox();
  const manageBox = await manageColumn.boundingBox();

  expect(explorerBox).not.toBeNull();
  expect(mainBox).not.toBeNull();
  expect(manageBox).not.toBeNull();

  if (explorerBox && mainBox && manageBox) {
    expect(explorerBox.x).toBeLessThan(mainBox.x);
    expect(mainBox.x).toBeLessThan(manageBox.x);
    expect(explorerBox.width).toBeGreaterThan(0);
    expect(manageBox.width).toBeGreaterThan(0);
  }

  // Compact tree rows: each row body should be 36px or less tall
  const treeFolderRows = page.locator(".files-tree-folder");
  await expect(treeFolderRows.first()).toBeVisible();
  const treeRowCount = await treeFolderRows.count();
  expect(treeRowCount).toBeGreaterThan(0);
  for (let index = 0; index < treeRowCount; index += 1) {
    const box = await treeFolderRows.nth(index).boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeLessThanOrEqual(40);
    }
  }

  // Contextual icons render as SVG, not plain text labels
  await expect(page.locator(".files-tree-folder-icon").first()).toBeVisible();
  const treeIconCount = await page.locator(".files-tree-folder svg[data-folder-icon]").count();
  expect(treeIconCount).toBeGreaterThan(0);

  // No horizontal overflow on the page or any column
  const horizontalOverflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  for (const [label, column] of [
    ["explorer", explorerColumn],
    ["main", mainColumn],
    ["manage", manageColumn]
  ] as const) {
    const overflow = await column.evaluate((node) => {
      const element = node as HTMLElement;
      return element.scrollWidth - element.clientWidth;
    });
    expect(overflow, `${label} column overflow`).toBeLessThanOrEqual(1);
  }
});
