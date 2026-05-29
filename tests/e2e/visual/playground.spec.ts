import { test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { expectStableScreenshot, VISUAL_VIEWPORT } from "../helpers/visual";

test.use({ viewport: VISUAL_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

test.describe("visual baseline / playground", () => {
  test("estado base", async ({ page }) => {
    await installApiMocks(page);
    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/playground" });
    await expectStableScreenshot(page, "playground-base.png");
  });
});
