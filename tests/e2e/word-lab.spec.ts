import { expect, test } from "@playwright/test";

// Validacao em navegador real do editor Word via rota-lab /dev/word-lab.

test.beforeEach(async ({ page }) => {
  // Bundle Tiptap pesa -> compilacao fria do dev server pode passar de 30s na 1a
  // navegacao. Damos folga ao timeout do teste (o gate real e a asercao).
  test.setTimeout(120_000);
  // So a imagem por URL usa prompt (a assinatura agora e editada no papel).
  page.on("dialog", (d) => d.accept(d.message().includes("URL") ? "/logo.png" : "Vendedor"));
  await page.goto("/dev/word-lab", { waitUntil: "networkidle" });
  await expect(page.locator(".word-editor-content")).toContainText("Contrato de compra e venda", {
    timeout: 60_000
  });
});

test("inserir logo + variavel + assinatura: tudo coexiste (nao apaga)", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");

  // Clica os botoes em sequencia SEM clicar no texto entre eles (uso real).
  await page.getByRole("button", { name: "Inserir logo" }).click();
  await page.getByRole("button", { name: "Placa", exact: true }).click();
  await page.getByRole("button", { name: "Inserir linha de assinatura" }).click();

  await expect(content).toContainText("Contrato de compra e venda");
  await expect(content.locator("img[src='/logo.png']")).toHaveCount(1);
  // Indexadores sempre em CAIXA ALTA no documento.
  await expect(content).toContainText("${PLACA}");
  await expect(content.locator(".word-signature")).toHaveCount(1);
});

test("redimensionar a imagem pela alca", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir logo" }).click();

  const img = content.locator("img[src='/logo.png']");
  await expect(img).toBeVisible();
  // logo entra com largura padrao sensata (~220px), nao gigante.
  const widthBefore = (await img.boundingBox())!.width;
  expect(widthBefore).toBeLessThan(320);

  // Seleciona a imagem -> aparecem os controles de largura na toolbar.
  await img.click();
  await page.getByRole("button", { name: "Largura G" }).click();

  const widthAfter = (await img.boundingBox())!.width;
  expect(widthAfter).toBeGreaterThan(widthBefore + 60);
  await expect(img).toHaveAttribute("style", /width:\s*360px/);
});

test("posicao livre: selecionar e arrastar a logo", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir logo" }).click();

  const wrap = page.locator(".word-img-wrap").first();
  await page.locator("img[src='/logo.png']").click();
  await page.getByRole("button", { name: /Posicao livre/ }).click();
  await expect(wrap).toHaveClass(/is-floating/);

  const before = (await wrap.boundingBox())!;
  await page.mouse.move(before.x + 25, before.y + 18);
  await page.mouse.down();
  await page.mouse.move(before.x + 25 + 130, before.y + 18 + 90, { steps: 12 });
  await page.mouse.up();

  const after = (await wrap.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 60);
  expect(after.y).toBeGreaterThan(before.y + 40);
  // a posicao (em mm) foi persistida no atributo do no
  await expect(wrap).toHaveAttribute("style", /left:/);
});

test("digitar logo apos a assinatura NAO a apaga", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir linha de assinatura" }).click();
  await page.keyboard.type("Texto depois da assinatura");

  await expect(content.locator(".word-signature")).toHaveCount(1);
  await expect(content).toContainText("Texto depois da assinatura");
  await expect(content).toContainText("Contrato de compra e venda");
});

test("preview reflete a largura da imagem (fidelidade)", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir logo" }).click();

  await page.getByRole("button", { name: "Visualizar" }).click();
  const previewImg = page.locator(".word-preview .word-print img").first();
  await expect(previewImg).toBeVisible();
  await expect(previewImg).toHaveAttribute("style", /width:\s*220px/);
});

test("clicar seleciona a imagem (contorno) e Del apaga", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir logo" }).click();

  const img = content.locator("img[src='/logo.png']");
  await img.click();
  await expect(page.locator(".ProseMirror-selectednode")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(img).toHaveCount(0);
  await expect(content).toContainText("Contrato de compra e venda");
});

test("assinatura: o nome sob a linha e editavel no papel", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir linha de assinatura" }).click();

  const label = content.locator(".word-signature-label");
  await expect(label).toContainText("Assinatura");
  await label.click({ clickCount: 3 });
  await page.keyboard.type("João da Silva — Comprador");
  await expect(content.locator(".word-signature")).toContainText("João da Silva — Comprador");
});

test("quebra de pagina: cria a 2a folha (guia + contador)", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: /Inserir quebra de pagina/ }).click();

  await expect(content.locator(".word-page-break")).toHaveCount(1);
  await expect(page.locator(".word-page-guide")).toHaveCount(1);
  await expect(page.locator(".word-page-count")).toContainText("2 páginas");
  await page.keyboard.type("Texto na pagina 2");
  await expect(content).toContainText("Texto na pagina 2");
});

test("zoom 'ajustar a largura': papel inteiro sem scroll horizontal", async ({ page }) => {
  const canvas = page.locator(".word-canvas");
  const dims = await canvas.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(dims.sw).toBeLessThanOrEqual(dims.cw + 1);
});

test("fidelidade: tipografia computada do editor IGUAL a do preview", async ({ page }) => {
  // Zoom 100% para comparar valores computados sem o fator de escala.
  await page.getByLabel("Zoom do papel").selectOption("1");
  const content = page.locator(".word-editor-content");
  await content.click();

  const readStyle = (el: Element) => {
    const cs = getComputedStyle(el);
    return {
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      marginBottom: cs.marginBottom,
      fontFamily: cs.fontFamily
    };
  };

  const editorStyle = await content.locator("p").first().evaluate(readStyle);
  await page.getByRole("button", { name: "Visualizar" }).click();
  const previewStyle = await page.locator(".word-preview .word-print p").first().evaluate(readStyle);

  expect(previewStyle).toEqual(editorStyle);
});

test("mudar as margens ajusta o papel", async ({ page }) => {
  const paper = page.locator(".word-paper");
  await page.getByLabel("Margens da pagina").selectOption("larga");
  await expect(paper).toHaveAttribute("style", /28mm/);
  await page.getByLabel("Margens da pagina").selectOption("estreita");
  await expect(paper).toHaveAttribute("style", /10mm/);
});

test("cadeado: item bloqueado deixa o texto atras editavel; badge desbloqueia", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir logo" }).click();

  const wrap = page.locator(".word-img-wrap").first();
  await content.locator("img[src='/logo.png']").click();
  await page.getByRole("button", { name: /Posicao livre/ }).click();
  await page.getByRole("button", { name: /Bloquear item/ }).click();

  await expect(wrap).toHaveClass(/is-locked/);
  const pe = await wrap.evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pe).toBe("none");
  // O cadeado nao vaza para o print: o badge e artefato do NodeView.
  await expect(wrap.locator(".word-lock-badge")).toBeVisible();

  // Clicar no badge desbloqueia (e seleciona o item de novo).
  await wrap.locator(".word-lock-badge").click();
  await expect(wrap).not.toHaveClass(/is-locked/);
  await expect(page.locator(".ProseMirror-selectednode")).toHaveCount(1);
});

test("desbloquear pelo RIBBON: botao destrava todos os itens travados", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");

  // Trava uma imagem...
  await page.getByRole("button", { name: "Inserir logo" }).click();
  await content.locator("img[src='/logo.png']").click();
  await page.getByRole("button", { name: /Bloquear item/ }).click();

  // ...e uma assinatura.
  await page.getByRole("button", { name: "Inserir linha de assinatura" }).click();
  await content.locator(".word-signature-grip").click({ force: true });
  await page.getByRole("button", { name: /Bloquear item/ }).click();

  // Com itens travados o ribbon SEMPRE mostra o destravamento.
  const unlock = page.getByRole("button", { name: /Destravar os 2 itens/ });
  await expect(unlock).toBeVisible();
  await unlock.click();

  await expect(page.locator(".is-locked")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Destravar/ })).toHaveCount(0);
});

test("duas colunas: blocos independentes com formatacao propria + preview flex", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Inserir duas colunas" }).click();

  const cols = content.locator(".word-column");
  await expect(cols).toHaveCount(2);

  // Digita na 1a coluna (o cursor entra nela apos inserir) e aplica negrito.
  await page.keyboard.type("Coluna esquerda");
  await cols.first().locator("p").first().click({ clickCount: 3 });
  await page.getByRole("button", { name: "Negrito" }).click();

  // Digita na 2a coluna sem formatacao.
  await cols.nth(1).locator("p").first().click();
  await page.keyboard.type("Coluna direita");

  await expect(cols.first().locator("strong")).toContainText("Coluna esquerda");
  await expect(cols.nth(1)).toContainText("Coluna direita");
  await expect(cols.nth(1).locator("strong")).toHaveCount(0);

  // Preview: colunas lado a lado (mesma geometria flex do editor).
  await page.getByRole("button", { name: "Visualizar" }).click();
  const previewCols = page.locator(".word-preview .word-columns > .word-column");
  await expect(previewCols).toHaveCount(2);
  const [a, b] = [await previewCols.first().boundingBox(), await previewCols.nth(1).boundingBox()];
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 2); // lado a lado, nao empilhadas
});

test("pincel de formatacao: copia o formato e cola na proxima selecao", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("origem destino");

  // Formata "origem " (negrito) e arma o pincel a partir dela.
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+Control+ArrowRight");
  await page.getByRole("button", { name: "Negrito" }).click();
  await page.getByRole("button", { name: /Pincel de formatacao/ }).click();

  // Seleciona "destino" -> o formato copiado e aplicado automaticamente.
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Control+ArrowLeft");

  const p = content.locator("p", { hasText: "origem destino" });
  await expect(p.locator("strong")).toContainText("destino");
});

test("tamanho de fonte flexivel: digitar 17 vira 17pt no texto", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Fonte sob medida");
  await page.keyboard.press("Shift+Home");

  const sizeInput = page.getByLabel("Tamanho da fonte");
  await sizeInput.fill("17");
  await sizeInput.press("Enter");

  const span = content.locator("span", { hasText: "Fonte sob medida" }).first();
  await expect(span).toHaveAttribute("style", /font-size:\s*17pt/);
});

test("justificar estica as linhas ate a margem (editor e preview)", async ({ page }) => {
  await page.getByLabel("Zoom do papel").selectOption("1");
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(
    "Paragrafo longo para validar a justificacao de texto no editor com fidelidade total de impressao, " +
      "quebrando varias linhas dentro da folha A4 e esticando cada linha cheia ate a margem direita."
  );
  await page.getByRole("button", { name: "Justificar" }).click();

  // Distancia entre o fim de cada linha cheia e a margem direita (deve ~0).
  const measureGaps = (el: Element) => {
    const ps = Array.from(el.querySelectorAll("p"));
    const p = ps.find((x) => (x.textContent ?? "").includes("Paragrafo longo"))!;
    const range = document.createRange();
    range.selectNodeContents(p);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 4);
    const pRect = p.getBoundingClientRect();
    return rects.slice(0, -1).map((r) => Math.abs(pRect.right - r.right));
  };

  const editorGaps = await content.evaluate(measureGaps);
  expect(editorGaps.length).toBeGreaterThan(0);
  for (const gap of editorGaps) expect(gap).toBeLessThan(2);

  await page.getByRole("button", { name: "Visualizar" }).click();
  const previewGaps = await page.locator(".word-preview .word-print").evaluate(measureGaps);
  expect(previewGaps.length).toBeGreaterThan(0);
  for (const gap of previewGaps) expect(gap).toBeLessThan(2);
});

test("formatacao em indexador: negrito pega no chip e o chip e UPPERCASE", async ({ page }) => {
  const content = page.locator(".word-editor-content");
  await content.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Placa", exact: true }).click();
  await expect(content).toContainText("${PLACA}");

  await page.keyboard.press("Control+a");
  await page.getByRole("button", { name: "Negrito" }).click();
  await expect(content.locator("strong .word-var, strong.word-var")).toHaveCount(1);

  // No preview o valor resolvido sai em CAIXA ALTA mantendo o negrito.
  await page.getByRole("button", { name: "Visualizar" }).click();
  const preview = page.locator(".word-preview .word-print");
  await expect(preview).toContainText("ABC1D23");
  await expect(preview.locator("strong")).toContainText("ABC1D23");
});
