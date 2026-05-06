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

async function signInWithDevRole(page: import("@playwright/test").Page) {
  await page.goto("/login?next=%2Farquivos", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("auth-dev-panel")).toBeVisible();
  await page.getByTestId("auth-dev-role").selectOption("ADMINISTRADOR");
  await page.getByTestId("auth-dev-submit").click();
  await expect(page).toHaveURL(/\/arquivos/);
}

test.describe.configure({ retries: 1, timeout: 60_000 });

test("Arquivos abre como explorer de pastas", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: "Central", exact: true })).toBeVisible();
  await expect(page.locator(".files-tree-row.is-active .files-tree-folder strong")).toHaveText("Documentos");
  await expect(page.locator(".files-path-line")).toHaveText("Central / Documentos");
  await expect(page.locator(".files-preview-context")).toHaveText("Central / Documentos");
  await expect(page.getByRole("button", { name: "Abrir raiz" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pasta pai" })).toBeVisible();
  await expect(page.locator(".files-selected-item-card .files-section-kicker")).toHaveText("Selecionado");
  await expect(page.locator(".files-preview-side strong")).toHaveText("foto-estoque.png");
  await expect(page.locator(".files-explorer-header-row")).toHaveText(/Nome.*Acoes/);
});
