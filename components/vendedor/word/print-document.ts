import { getSchema, type JSONContent } from "@tiptap/core";
import { DOMSerializer, Node as PMNode } from "@tiptap/pm/model";
import { escapeHtml } from "@/components/ui-grid/value-format";
import { buildExtensions, normalizeDoc, resolveDoc } from "@/components/vendedor/word/tiptap-config";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/variables";

/**
 * Gera o HTML do documento com os tokens `${...}` ja resolvidos (preview/print).
 *
 * Usa o DOMSerializer nativo do ProseMirror com o `document` real do navegador
 * (NAO `@tiptap/html`/zeed-dom, que DESCARTA o atributo `style` — derrubando
 * cor/fonte/tamanho/realce/alinhamento do texto e largura/posicao da imagem).
 */
export function renderDocumentHTML(doc: JSONContent, ctx: VendaDocContext): string {
  const resolved = resolveDoc(normalizeDoc(doc), ctx) ?? { type: "doc", content: [{ type: "paragraph" }] };
  const schema = getSchema(buildExtensions());
  const node = PMNode.fromJSON(schema, resolved);
  const serializer = DOMSerializer.fromSchema(schema);
  const container = document.createElement("div");
  container.appendChild(serializer.serializeFragment(node.content, { document }));
  return container.innerHTML;
}

function buildPrintCss(marginMm: number): string {
  return `
  @page { size: A4; margin: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  /* Pagina A4 com a margem como padding. */
  .word-print {
    width: 210mm;
    padding: ${marginMm}mm;
    margin: 0 auto;
  }
  /* Ancora dos flutuantes: a AREA DE CONTEUDO (dentro das margens) — no
     editor o ancora e o proprio .ProseMirror (position:relative), que comeca
     depois do padding do papel. Sem este wrapper o print ancorava no canto
     do papel e a posicao saia deslocada pela margem (logo "subia" 18mm). */
  .word-print-anchor { position: relative; }
  /* Tipografia compartilhada com o editor/preview (doc-styles.ts). */
  ${docTypographyCss(".word-print")}
  /* Quebra manual: pagina nova + espacador recriando a margem superior. */
  .word-page-break { break-before: page; page-break-before: always; height: ${marginMm}mm; }
  .word-img-wrap { display: inline-block; }
  .word-img-handle { display: none; }
  @media print { .no-print { display: none !important; } }
`;
}

/**
 * Abre uma janela com o documento renderizado e dispara o dialogo de impressao.
 * O usuario escolhe "Salvar como PDF" no proprio navegador (padrao do app, que
 * nao usa lib de PDF — ver components/ui-grid/print-job.ts).
 */
export function printDocument(bodyHTML: string, title: string, marginMm = 18): void {
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) {
    window.alert("Nao foi possivel abrir a janela de impressao. Verifique o bloqueador de pop-ups.");
    return;
  }

  win.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />` +
      `<title>${escapeHtml(title)}</title><style>${buildPrintCss(marginMm)}</style></head>` +
      `<body><div class="word-print"><div class="word-print-anchor">${bodyHTML}</div></div></body></html>`
  );
  win.document.close();
  win.focus();

  const triggerPrint = () => {
    try {
      win.print();
    } catch {
      /* janela fechada pelo usuario */
    }
  };
  win.onload = triggerPrint;
  // Fallback: alguns navegadores nao disparam onload em about:blank.
  window.setTimeout(triggerPrint, 400);
}
