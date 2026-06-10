/**
 * Metricas tipograficas UNICAS do documento Word — fonte de verdade usada em
 * TRES lugares (mesma string de CSS, so muda o seletor-raiz):
 *
 *   1. Editor:    docTypographyCss(".word-paper .word-editor-content")
 *   2. Preview:   docTypographyCss(".word-preview .word-print")
 *   3. Impressao: docTypographyCss(".word-print") em buildPrintCss
 *
 * E o que garante a fidelidade 1:1 entre o que se edita e o que imprime.
 * NUNCA duplique estas regras em CSS estatico (vendedor.css fica so com o
 * "chrome" do editor: alcas, selecao, guias, toolbar).
 *
 * orphans/widows: 1 -> a quebra automatica de pagina no print acontece na
 * exata linha que nao coube (como o editor desenha), sem puxar linhas extras.
 */
export function docTypographyCss(scope: string): string {
  const s = scope.trim();
  return `
  ${s} {
    font-family: "Times New Roman", Georgia, serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #111;
    overflow-wrap: break-word;
    hyphens: manual;
    font-kerning: normal;
  }
  ${s}, ${s} * { box-sizing: border-box; }
  ${s} p { margin: 0 0 8pt; min-height: 1em; orphans: 1; widows: 1; }
  ${s} p:empty::after { content: "\\00a0"; }
  ${s} h1 { font-size: 20pt; line-height: 1.25; font-weight: bold; margin: 0 0 12pt; }
  ${s} h2 { font-size: 16pt; line-height: 1.25; font-weight: bold; margin: 0 0 10pt; }
  ${s} h3 { font-size: 14pt; line-height: 1.25; font-weight: bold; margin: 0 0 8pt; }
  ${s} ul, ${s} ol { margin: 0 0 8pt; padding: 0 0 0 28pt; }
  ${s} li { orphans: 1; widows: 1; }
  ${s} li > p { margin: 0; }
  ${s} blockquote { margin: 0 0 8pt 24pt; padding: 0; }
  ${s} hr { border: 0; border-top: 1px solid #999; margin: 8pt 0; height: 0; }
  ${s} mark { padding: 0 2px; }
  ${s} strong { font-weight: bold; }
  ${s} a { color: inherit; }
  ${s} img { display: block; max-width: 100%; height: auto; }
  ${s} .word-signature {
    position: relative;
    margin: 28pt 0 0;
    text-align: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  ${s} .word-signature-line { border-top: 1px solid #111; width: 70%; margin: 0 auto 4pt; height: 0; }
  ${s} .word-signature-label { font-size: 11pt; color: #333; min-height: 1em; outline: none; }
`;
}
