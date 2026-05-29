import { test } from "@playwright/test";
import { installApiMocks } from "../helpers/api-mocks";
import { expectStableScreenshot, VISUAL_VIEWPORT } from "../helpers/visual";

test.use({ viewport: VISUAL_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

test.describe("visual baseline / login", () => {
  test("estado base (dev panel visivel)", async ({ page }) => {
    await installApiMocks(page);
    await page.goto("/login");
    await page.getByTestId("auth-dev-panel").waitFor({ state: "visible" });
    await expectStableScreenshot(page, "login-base.png");
  });
});
