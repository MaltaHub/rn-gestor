import { expect, type Locator, type Page } from "@playwright/test";

export const VISUAL_VIEWPORT = { width: 1440, height: 900 } as const;

const STABILIZE_STYLES = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  /* Esconde o badge do Next dev (ícone "N" no rodapé e overlays de erro/portal) */
  nextjs-portal,
  #__next-build-watcher,
  [data-nextjs-toast],
  [data-nextjs-dialog-overlay],
  [data-nextjs-dialog] {
    display: none !important;
  }
`;

export async function settleForScreenshot(page: Page) {
  await page
    .evaluate(
      async () =>
        new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 5000);
          if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
              window.clearTimeout(timer);
              resolve();
            });
          } else {
            window.clearTimeout(timer);
            resolve();
          }
        })
    )
    .catch(() => {
      /* fonts.ready pode falhar em ambientes restritos; segue */
    });
  await page.addStyleTag({ content: STABILIZE_STYLES });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
    /* networkidle pode não acontecer com long-poll; segue mesmo assim */
  });
}

export type ScreenshotOptions = {
  mask?: Locator[];
  fullPage?: boolean;
};

export async function expectStableScreenshot(page: Page, name: string, options: ScreenshotOptions = {}) {
  await settleForScreenshot(page);
  await expect(page).toHaveScreenshot(name, {
    fullPage: options.fullPage ?? true,
    animations: "disabled",
    mask: options.mask,
    maxDiffPixelRatio: 0.01
  });
}
