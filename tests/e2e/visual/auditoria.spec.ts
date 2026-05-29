import { test } from "@playwright/test";
import { signInAsDevRole } from "../helpers/auth";
import { installApiMocks } from "../helpers/api-mocks";
import { expectStableScreenshot, VISUAL_VIEWPORT } from "../helpers/visual";

test.use({ viewport: VISUAL_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

test.describe("visual baseline / auditoria", () => {
  test("estado base", async ({ page }) => {
    await installApiMocks(page);
    await signInAsDevRole(page, "ADMINISTRADOR", { next: "/auditoria" });
    await expectStableScreenshot(page, "auditoria-base.png");
  });
});
