import { expect, test, type Page } from "@playwright/test";
import { installApiMocks } from "./helpers/api-mocks";
import { signInAsDevRole } from "./helpers/auth";

test.describe.configure({ timeout: 90_000 });

const NOW = new Date().toISOString();
const ROLES = [
  { code: "ADMINISTRADOR", name: "Administrador" },
  { code: "GERENTE", name: "Gerente" },
  { code: "SECRETARIO", name: "Secretario" },
  { code: "VENDEDOR", name: "Vendedor" }
];
const STATUSES = [
  { code: "PENDENTE", name: "Pendente" },
  { code: "APROVADO", name: "Aprovado" },
  { code: "BLOQUEADO", name: "Bloqueado" },
  { code: "BANIDO", name: "Banido" }
];

function user(id: string, nome: string, email: string, cargo: string, status: string) {
  return { id, auth_user_id: null, nome, email, cargo, status, foto: null, obs: null, ultimo_login: NOW, aprovado_em: null, created_at: NOW, updated_at: NOW };
}

const USERS = [
  user("u-self", "Modo local ADMINISTRADOR", "administrador@rn-gestor.local", "ADMINISTRADOR", "APROVADO"),
  user("u-ana", "Ana Souza", "ana@loja.com", "VENDEDOR", "APROVADO"),
  user("u-novo", "Bruno Lima", "bruno@loja.com", "VENDEDOR", "PENDENTE"),
  user("u-ban", "Carlos Dias", "carlos@loja.com", "VENDEDOR", "BANIDO")
];

async function openUsers(page: Page) {
  const patches: Array<{ id: string; body: Record<string, unknown> }> = [];
  await installApiMocks(page);
  await page.route("**/api/v1/admin/users**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      const id = url.pathname.split("/").pop() ?? "";
      const body = request.postDataJSON() as Record<string, unknown>;
      patches.push({ id, body });
      const current = USERS.find((entry) => entry.id === id)!;
      return route.fulfill({ json: { data: { user: { ...current, ...body } }, meta: { request_id: "e2e" } } });
    }
    return route.fulfill({ json: { data: { users: USERS, lookups: { roles: ROLES, statuses: STATUSES } }, meta: { request_id: "e2e" } } });
  });
  await signInAsDevRole(page, "ADMINISTRADOR", { next: "/admin/usuarios" });
  await expect(page.getByTestId("users-page")).toBeVisible();
  await expect(page.getByTestId("users-row")).toHaveCount(4);
  return patches;
}

async function expectNoHorizontalOverflow(page: Page, testId: string) {
  const result = await page.getByTestId(testId).evaluate((element) => {
    const root = element.getBoundingClientRect();
    const offenders = Array.from(element.querySelectorAll<HTMLElement>("*"))
      .filter((child) => {
        const box = child.getBoundingClientRect();
        return box.width > 0 && (box.right > root.right + 1 || box.left < root.left - 1);
      })
      .map((child) => child.className || child.tagName);
    return { pageScroll: document.documentElement.scrollWidth > window.innerWidth, offenders: offenders.slice(0, 5) };
  });
  expect(result.pageScroll).toBe(false);
  expect(result.offenders).toEqual([]);
}

test.describe("usuários", () => {
  test("pendente: aprova com o cargo escolhido", async ({ page }) => {
    const patches = await openUsers(page);
    const pending = page.getByTestId("users-pending-row");
    await expect(pending).toHaveCount(1);
    await expect(pending).toContainText("Bruno Lima");
    await pending.getByRole("combobox").selectOption("SECRETARIO");
    await pending.getByTestId("users-approve").click();
    await expect.poll(() => patches).toEqual([{ id: "u-novo", body: { status: "APROVADO", cargo: "SECRETARIO" } }]);
    await expect(page.getByTestId("users-pending")).toHaveCount(0);
  });

  test("filtros por situação com contagem; busca por nome", async ({ page }) => {
    await openUsers(page);
    await expect(page.getByTestId("users-group-bloqueado")).toContainText("1");
    await page.getByTestId("users-group-bloqueado").click();
    await expect(page.getByTestId("users-row")).toHaveCount(1);
    await expect(page.getByTestId("users-row")).toContainText("Carlos Dias");
    await page.getByTestId("users-group-todos").click();
    await page.getByTestId("users-search").fill("ana");
    await expect(page.getByTestId("users-row")).toHaveCount(1);
  });

  test("editar: diálogo salva só o que mudou; a própria conta não pode ser banida", async ({ page }) => {
    const patches = await openUsers(page);
    await page.getByTestId("users-row").filter({ hasText: "Ana Souza" }).click();
    const dialog = page.getByTestId("user-edit-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("user-edit-save")).toBeDisabled();
    await dialog.getByTestId("user-edit-cargo").selectOption("GERENTE");
    await dialog.getByTestId("user-edit-save").click();
    await expect.poll(() => patches.at(-1)?.body.cargo).toBe("GERENTE");
    await expect(dialog).toBeHidden();

    const self = page.getByTestId("users-row").filter({ hasText: "Modo local ADMINISTRADOR" });
    await expect(self).toContainText("você");
    await self.click();
    await expect(dialog.getByTestId("user-ban")).toHaveCount(0);
    await expect(dialog.getByTestId("user-delete")).toHaveCount(0);
    await expect(dialog.getByTestId("user-edit-cargo")).toBeDisabled();
  });

  test("celular: cabe sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openUsers(page);
    await expectNoHorizontalOverflow(page, "users-page");
  });
});

test.describe("perfil", () => {
  async function openProfile(page: Page) {
    await installApiMocks(page);
    await page.route("**/api/v1/me/perfil", (route) =>
      route.fulfill({
        json: {
          data: { id: "u-self", nome: "Modo local ADMINISTRADOR", email: "administrador@rn-gestor.local", foto: null, bio: null, telefone: null },
          meta: { request_id: "e2e" }
        }
      })
    );
    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/perfil" });
    await expect(page.getByTestId("profile-page")).toBeVisible();
  }

  test("identidade, contato e senha numa coluna; salvar só com mudança", async ({ page }) => {
    await openProfile(page);
    const profile = page.getByTestId("profile-page");
    await expect(profile.getByRole("heading", { level: 1 })).toHaveText("Modo local ADMINISTRADOR");
    await expect(profile).toContainText("Administrador");
    await expect(profile.getByRole("heading", { name: "Contato nos links" })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Senha" })).toBeVisible();
    await expect(page.getByTestId("profile-save")).toBeDisabled();
    await page.getByTestId("profile-telefone").fill("13999990000");
    await expect(page.getByTestId("profile-save")).toBeEnabled();
  });

  test("celular: cabe sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProfile(page);
    await expectNoHorizontalOverflow(page, "profile-page");
  });
});
