import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * HMI visual + layout smoke for the minimalist redesign.
 *
 * The browser Supabase client is a null stub in this app, so authentication
 * runs exclusively through the dev-mode login panel. Each authenticated page is
 * reached via `/login?next=<path>` + dev login (ADMINISTRADOR), while feature
 * APIs are mocked with sensible empty payloads so every shell reaches a stable,
 * paint-complete state.
 *
 * The goal: verify each page renders with no fatal script errors and no
 * page-level horizontal overflow (no improper overlap), and capture a
 * screenshot per page.
 */

const PAGES: { path: string; name: string; needsAuth: boolean; urlRe: RegExp }[] = [
  { path: "/login", name: "login", needsAuth: false, urlRe: /\/login/ },
  { path: "/", name: "home-grid", needsAuth: true, urlRe: /\/$/ },
  { path: "/arquivos", name: "arquivos", needsAuth: true, urlRe: /\/arquivos/ },
  { path: "/playground", name: "playground", needsAuth: true, urlRe: /\/playground/ },
  { path: "/auditoria", name: "auditoria", needsAuth: true, urlRe: /\/auditoria/ },
  { path: "/price-contexts", name: "price-contexts", needsAuth: true, urlRe: /\/price-contexts/ },
  { path: "/perfil", name: "perfil", needsAuth: true, urlRe: /\/perfil/ },
  { path: "/admin/usuarios", name: "admin-usuarios", needsAuth: true, urlRe: /\/admin\/usuarios/ }
];

function emptyPayloadFor(pathname: string): unknown {
  if (pathname.endsWith("/me")) {
    return { user: { id: "user-1", email: "demo@rn.dev", role: "ADMINISTRADOR" } };
  }
  if (pathname.includes("/files/automation-config")) {
    return { data: { displayField: "placa", repositories: {}, configs: [] } };
  }
  if (pathname.includes("/files/folders")) return { data: { folders: [] } };
  if (pathname.includes("/lookups")) return { lookups: {} };
  if (pathname.includes("/grid")) return { rows: [], columns: [], total: 0 };
  if (pathname.includes("/insights/summary")) return { summary: {} };
  if (pathname.includes("/auditoria/dashboard")) return { entries: [], authors: [], tables: [] };
  if (pathname.includes("/auditoria")) return { entries: [], total: 0 };
  if (pathname.includes("/admin/users")) return { users: [] };
  if (pathname.includes("/price-contexts")) return { contexts: [], rows: [] };
  if (pathname.includes("/observacoes")) return { observacoes: [], items: [] };
  if (pathname.includes("/editor-flows")) return { flows: [] };
  return { data: { items: [], rows: [], folders: [] }, items: [], rows: [] };
}

async function mockBackend(page: Page) {
  await page.route("**/api/v1/**", async (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: emptyPayloadFor(url.pathname) as object });
  });
}

async function devLogin(page: Page, nextPath: string, urlRe: RegExp) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("auth-dev-panel")).toBeVisible();
  await page.getByTestId("auth-dev-role").selectOption("ADMINISTRADOR");
  await page.getByTestId("auth-dev-submit").click();
  await expect(page).toHaveURL(urlRe);
}

test.describe("HMI visual + layout", () => {
  // The grid shell compiles slowly on first hit in dev; absorb cold-compile.
  test.describe.configure({ retries: 1, timeout: 90_000 });

  // Prewarm every route once per worker so the dev server's first-hit
  // compilation doesn't race the per-test timeout under parallel load.
  test.beforeAll(async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL });
    for (const { path } of PAGES) {
      await ctx.get(path).catch(() => {});
    }
    await ctx.dispose();
  });

  for (const { path, name, needsAuth, urlRe } of PAGES) {
    test(`renders ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const fatal: string[] = [];
      page.on("pageerror", (err) => fatal.push(String(err)));

      await mockBackend(page);

      if (needsAuth) {
        await devLogin(page, path, urlRe);
      } else {
        await page.goto(path, { waitUntil: "domcontentloaded" });
      }

      await page.waitForLoadState("load").catch(() => {});
      await page.waitForFunction(() => document.body && document.body.children.length > 0, null, {
        timeout: 15_000
      });
      await page.waitForLoadState("networkidle").catch(() => {});

      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflowX, "page-level horizontal overflow (px)").toBeLessThanOrEqual(4);

      await page.screenshot({ path: `test-results/hmi/${name}.png`, fullPage: true });

      expect(fatal, fatal.join("\n")).toHaveLength(0);
    });
  }
});
