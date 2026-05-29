import type { Page } from "@playwright/test";

type Role = "VENDEDOR" | "SECRETARIO" | "GERENTE" | "ADMINISTRADOR";

/**
 * Navega para `next` e faz login via painel dev (development only).
 * Se o painel nao aparecer (sessao ja ativa), segue em frente.
 */
export async function signInAsDevRole(
  page: Page,
  role: Role,
  options?: { next?: string }
): Promise<void> {
  const target = options?.next ?? "/";
  await page.goto(target, { waitUntil: "domcontentloaded" });

  const authPanel = page.getByTestId("auth-dev-panel");
  const devSubmit = page.getByTestId("auth-dev-submit");

  // Se o painel de dev nao aparecer em 3s, considera sessao ja ativa.
  const panelVisible = await authPanel
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  if (panelVisible) {
    await page.getByTestId("auth-dev-role").selectOption(role);
    await devSubmit.click();
    // Aguarda redirect pos-login: a URL deve mudar pra fora de /login
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 });
  }
}
