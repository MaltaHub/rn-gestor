/**
 * Conferência antes de imprimir: quais variáveis do documento vão sair VAZIAS
 * com os dados atuais da venda (só nos trechos que aparecem — seções cujas
 * condições não valem são ignoradas). Evita imprimir recibo sem CPF, etc.
 */
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import { avaliarCondicao } from "@/lib/domain/venda-documentos/condicoes";
import { resolveToken, VARIAVEIS_DISPONIVEIS } from "@/lib/domain/venda-documentos/variables";

type No = { type?: string; attrs?: Record<string, unknown> | null; content?: No[] | null };

function normalizar(token: string) {
  return token
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

const ROTULOS = new Map(VARIAVEIS_DISPONIVEIS.map((variavel) => [normalizar(variavel.token), variavel.label]));

// Vazios por natureza (o trecho some de propósito): não viram aviso.
const OPCIONAIS = new Set(["ipva", "troca", "debitos", "debitos.valor", "debitos.descricao", "troca.debitos", "troca.debitos.valor", "observacao", "desconto", "desconto.extenso", "entrada.detalhe", "comprador.email", "codigo_oficial", "modelo.codigo"]);

export type CampoVazio = { token: string; label: string };

export function camposVazios(doc: No | null | undefined, ctx: VendaDocContext): CampoVazio[] {
  const vistos = new Map<string, CampoVazio>();
  const visitar = (node: No | null | undefined) => {
    if (!node) return;
    if (node.type === "conditionalBlock" && !avaliarCondicao(ctx, String(node.attrs?.condicao ?? ""))) return;
    if (node.type === "variable") {
      const token = String(node.attrs?.token ?? "");
      const key = normalizar(token);
      if (key && !OPCIONAIS.has(key) && !vistos.has(key) && !resolveToken(ctx, token).trim()) {
        vistos.set(key, { token, label: ROTULOS.get(key) ?? token });
      }
    }
    for (const child of node.content ?? []) visitar(child);
  };
  visitar(doc);
  return Array.from(vistos.values());
}
