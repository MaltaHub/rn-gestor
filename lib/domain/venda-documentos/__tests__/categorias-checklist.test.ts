import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIA_KEYS, CATEGORIAS, sugerirCategoria } from "@/lib/domain/venda-documentos/categorias";
import { categoriaDoDocumento, montarChecklist, resumoChecklist } from "@/lib/domain/venda-documentos/checklist";
import { avaliarCondicao, CONDICOES } from "@/lib/domain/venda-documentos/condicoes";
import { modeloDaCategoria, modelosDaCategoria, type DocNode } from "@/lib/domain/venda-documentos/modelos";
import { amostrasVenda } from "@/lib/domain/venda-documentos/amostras";
import { isTokenConhecido } from "@/lib/domain/venda-documentos/variables";
import { situacaoDaVenda } from "@/lib/domain/vendas/situacao";

describe("catálogo de categorias", () => {
  it("o CHECK da migration tem exatamente as chaves do catálogo", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261109180000_documentos_venda_categoria.sql"), "utf8");
    for (const key of CATEGORIA_KEYS) expect(sql).toContain(`'${key}'`);
    expect(CATEGORIAS.map((c) => c.key)).toEqual([...CATEGORIA_KEYS]);
  });

  it("sugere a categoria de templates antigos pelo título", () => {
    expect(sugerirCategoria("Recibo de Venda (Financiado Com Entrada e IPVA Pago)")).toBe("recibo_venda");
    expect(sugerirCategoria("Recibo de sinal")).toBe("recibo_sinal");
    expect(sugerirCategoria("Termo de entrega do veículo")).toBe("termo_entrega");
    expect(sugerirCategoria("Procuração")).toBe("procuracao_transferencia");
    expect(sugerirCategoria("Qualquer coisa")).toBeNull();
  });
});

describe("situação da venda", () => {
  it("deriva do estado + estágio, e do carro quando não há venda", () => {
    expect(situacaoDaVenda({ estado_venda: "aberta", estagio: "aberto" })).toBe("reservado");
    expect(situacaoDaVenda({ estado_venda: "concluida", estagio: "aberto" })).toBe("vendido");
    expect(situacaoDaVenda({ estado_venda: "concluida", estagio: "na_garantia" })).toBe("entregue");
    expect(situacaoDaVenda({ estado_venda: "concluida", estagio: "finalizado" })).toBe("finalizado");
    expect(situacaoDaVenda(null, "DISPONÍVEL")).toBe("disponivel");
    expect(situacaoDaVenda(null, "VENDIDO")).toBe("vendido");
    expect(situacaoDaVenda(null, "ATENCAO")).toBe("indisponivel");
  });
});

describe("checklist documental", () => {
  const base = { temEntrada: false, temTroca: false, tipoTransferencia: "loja" };

  it("vendido: recibo obrigatório; contrato, procuração e entrega recomendados", () => {
    const itens = montarChecklist({ ...base, situacao: "vendido" }, []);
    const porChave = Object.fromEntries(itens.map((item) => [item.categoria.key, item.relevancia]));
    expect(porChave.recibo_venda).toBe("obrigatorio");
    expect(porChave.contrato_venda).toBe("recomendado");
    expect(porChave.procuracao_transferencia).toBe("recomendado");
    expect(porChave.termo_entrega).toBe("recomendado");
    expect(porChave.termo_troca).toBeUndefined();
    expect(resumoChecklist(itens).obrigatoriosPendentes).toBe(1);
  });

  it("troca torna o termo da troca obrigatório; entregue exige o termo de entrega", () => {
    const itens = montarChecklist({ ...base, situacao: "entregue", temTroca: true }, []);
    const porChave = Object.fromEntries(itens.map((item) => [item.categoria.key, item.relevancia]));
    expect(porChave.termo_troca).toBe("obrigatorio");
    expect(porChave.termo_entrega).toBe("obrigatorio");
    expect(porChave.termo_garantia).toBe("recomendado");
  });

  it("documento gerado tira a pendência e a via assinada aparece como arquivada", () => {
    const itens = montarChecklist(
      { ...base, situacao: "vendido" },
      [{ id: "d1", titulo: "Recibo", categoria: "recibo_venda", updatedAt: "2026-11-09" }],
      new Set(["recibo_venda"])
    );
    const recibo = itens.find((item) => item.categoria.key === "recibo_venda");
    expect(recibo?.pendente).toBe(false);
    expect(recibo?.arquivado).toBe(true);
  });

  it("documento antigo sem categoria entra pela sugestão do título", () => {
    expect(categoriaDoDocumento({ categoria: null, titulo: "Termo de entrega" })).toBe("termo_entrega");
    expect(categoriaDoDocumento({ categoria: null, titulo: "Rascunho" })).toBe("outro");
  });
});

describe("condições das seções", () => {
  it("avaliam a venda; desconhecida mostra o texto", () => {
    const [aVista, financiado, troca] = amostrasVenda(new Date(2026, 5, 9));
    expect(avaliarCondicao(aVista.contexto, "a_vista")).toBe(true);
    expect(avaliarCondicao(aVista.contexto, "tem_entrada")).toBe(false);
    expect(avaliarCondicao(financiado.contexto, "tem_entrada")).toBe(true);
    expect(avaliarCondicao(troca.contexto, "tem_troca")).toBe(true);
    expect(avaliarCondicao(troca.contexto, "ipva_pago")).toBe(false);
    expect(avaliarCondicao(troca.contexto, "condicao_que_nao_existe")).toBe(true);
    expect(new Set(CONDICOES.map((c) => c.key)).size).toBe(CONDICOES.length);
  });
});

function tokens(node: DocNode, out: string[] = []): string[] {
  if (node.type === "variable") out.push(String(node.attrs?.token));
  for (const child of node.content ?? []) tokens(child, out);
  return out;
}

function condicoes(node: DocNode, out: string[] = []): string[] {
  if (node.type === "conditionalBlock") out.push(String(node.attrs?.condicao));
  for (const child of node.content ?? []) condicoes(child, out);
  return out;
}

describe("modelos embutidos", () => {
  it("toda categoria tem modelo e só usa variáveis e condições conhecidas", () => {
    const conhecidas = new Set(CONDICOES.map((c) => c.key));
    for (const categoria of CATEGORIA_KEYS) {
      expect(modeloDaCategoria(categoria).id).toBe(`modelo:${categoria}`);
      for (const modelo of modelosDaCategoria(categoria)) {
        expect(modelo.categoria).toBe(categoria);
        for (const token of tokens(modelo.conteudo)) expect(isTokenConhecido(token), `${modelo.id}: ${token}`).toBe(true);
        for (const condicao of condicoes(modelo.conteudo)) expect(conhecidas.has(condicao), `${modelo.id}: ${condicao}`).toBe(true);
      }
    }
  });

  it("o recibo é UM template para todos os pagamentos (cláusula, não texto fixo)", () => {
    const recibo = modeloDaCategoria("recibo_venda");
    expect(tokens(recibo.conteudo)).toContain("pagamento");
    expect(JSON.stringify(recibo.conteudo)).not.toMatch(/COM ENTRADA/);
  });
});
