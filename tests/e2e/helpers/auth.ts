import type { Page } from "@playwright/test";

export type DevRole = "VENDEDOR" | "SECRETARIO" | "GERENTE" | "ADMINISTRADOR";

// Espelha lib/domain/auth-session.ts DEV_ACTOR_AUTH_USER_IDS.
export const DEV_ACTOR_IDS: Record<DevRole, string> = {
  VENDEDOR: "11111111-1111-4111-8111-111111111111",
  SECRETARIO: "22222222-2222-4222-8222-222222222222",
  GERENTE: "33333333-3333-4333-8333-333333333333",
  ADMINISTRADOR: "44444444-4444-4444-8444-444444444444"
};

/** Actor dev (mesmo shape de /api/v1/me) usado nos mocks de API dos testes visuais. */
export function buildDevActor(role: DevRole = "ADMINISTRADOR") {
  return {
    authUserId: DEV_ACTOR_IDS[role],
    role,
    status: "APROVADO",
    userId: null,
    userName: `Modo local ${role}`,
    userEmail: `${role.toLowerCase()}@rn-gestor.local`
  };
}

/**
 * Navega para `next` e faz login via painel dev (development only).
 * Se o painel nao aparecer (sessao ja ativa), segue em frente.
 */
export async function signInAsDevRole(
  page: Page,
  role: DevRole,
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
