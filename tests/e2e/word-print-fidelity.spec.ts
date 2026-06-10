import { expect, test } from "@playwright/test";

// Fidelidade da POSICAO LIVRE: a logo flutuante tem que sair na impressao na
// MESMA posicao (e com a MESMA sobreposicao) que aparece no editor.
// Regressao: a ancora do print era o canto do papel e a do editor era a area
// de conteudo (.ProseMirror) -> tudo imprimia deslocado pela margem (18mm).

test("fidelidade: logo flutuante imprime na MESMA posicao do editor (sobrepondo a frase)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/dev/word-lab", { waitUntil: "networkidle" });
  await expect(page.locator(".word-editor-content")).toContainText("Contrato", { timeout: 60_000 });
  await page.getByLabel("Zoom do papel").selectOption("1");

  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir logo" }).click();
  await page.locator(".word-editor-content img").first().click();
  await page.getByRole("button", { name: /Posicao livre/ }).click();

  // Arrasta a logo para CIMA da primeira frase (sobrepoe no editor).
  const wrap = page.locator(".word-img-wrap").first();
  const before = (await wrap.boundingBox())!;
  await page.mouse.move(before.x + 30, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x + 30 - 40, before.y + 20 - 60, { steps: 8 });
  await page.mouse.up();

  const PX_PER_MM = 96 / 25.4;
  const paperBox = (await page.locator(".word-paper").boundingBox())!;
  const imgBox = (await wrap.boundingBox())!;
  const pBox = (await content.locator("p").first().boundingBox())!;
  const editorImgMm = {
    left: (imgBox.x - paperBox.x) / PX_PER_MM,
    top: (imgBox.y - paperBox.y) / PX_PER_MM
  };
  const editorOverlap =
    imgBox.x < pBox.x + pBox.width &&
    imgBox.x + imgBox.width > pBox.x &&
    imgBox.y < pBox.y + pBox.height &&
    imgBox.y + imgBox.height > pBox.y;
  expect(editorOverlap).toBe(true);

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Imprimir / PDF" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");

  const print = await popup.evaluate(() => {
    const PXMM = 96 / 25.4;
    const root = document.querySelector(".word-print") as HTMLElement;
    const img = document.querySelector(".word-print img") as HTMLElement;
    const p = document.querySelector(".word-print p") as HTMLElement;
    const rootRect = root.getBoundingClientRect();
    const a = img.getBoundingClientRect();
    const b = p.getBoundingClientRect();
    return {
      imgMm: { left: (a.x - rootRect.x) / PXMM, top: (a.y - rootRect.y) / PXMM },
      overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    };
  });

  // Mesma posicao no papel (tolerancia < 1mm) — antes divergia pela margem.
  expect(Math.abs(print.imgMm.left - editorImgMm.left)).toBeLessThan(1);
  expect(Math.abs(print.imgMm.top - editorImgMm.top)).toBeLessThan(1);
  // E a sobreposicao com a frase acontece no print igual ao editor.
  expect(print.overlap).toBe(true);
});
