// Sanitizador simples e idempotente para corrigir mojibake (ex.: "Ã§" → "ç").
// Decodifica textos que foram lidos como Latin‑1 quando eram UTF‑8 e corrige
// nós de texto no DOM durante o bootstrap.

function maybeFixMojibake(text: string): string {
  // Sinalizadores comuns de mojibake: Ã (\u00C3), Â (\u00C2), caractere substituto (\uFFFD)
  if (!/[\u00C3\u00C2\uFFFD]/.test(text)) return text;

  // Correção específica e barata para o caso mais comum: "Ã§"/"Ã‡"
  // "Ã§" = \u00C3 \u00A7; "Ã‡" = \u00C3 \u0087
  let next = text.replace(/\u00C3\u00A7/g, "ç").replace(/\u00C3\u0087/g, "Ç");

  // Tenta uma decodificação geral (latin1→utf8) se ainda persistir marca de mojibake
  if (/[\u00C3\u00C2\uFFFD]/.test(next)) {
    try {
      // escape() gera percent‑encoding Latin‑1; decodeURIComponent reinterpreta como UTF‑8
      const decoded = decodeURIComponent(escape(next));
      if (decoded) next = decoded;
    } catch {
      // ignorar — manteremos as correções específicas já aplicadas
    }
  }

  // Normalizações pontuais
  next = next.replace(/\u00B7/g, "·"); // bullet middle dot
  return next;
}

function sanitizeTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (true) {
    const node = walker.nextNode() as Text | null;
    if (!node) break;
    nodes.push(node);
  }

  for (const node of nodes) {
    const oldValue = node.nodeValue ?? "";
    const nextValue = maybeFixMojibake(oldValue);
    if (nextValue !== oldValue) node.nodeValue = nextValue;
  }
}

let installed = false;

export function installMojibakeSanitizer() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const run = () => sanitizeTextNodes(document.body);
  run();

  const observer = new MutationObserver(() => run());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
  setTimeout(() => observer.disconnect(), 2500);
}

