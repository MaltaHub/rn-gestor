"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ChoiceListDialog, type ChoiceOption } from "@/components/ui/dialog/choice-list";
import type { RequestAuth } from "@/components/ui-grid/types";
import { createDocumento, fetchTemplates } from "@/components/vendedor/word/api";
import { escolhaAutomatica, opcoesDaCategoria, type OpcaoModelo } from "@/components/vendedor/word/opcoes-modelo";
import { CATEGORIAS, categoriaLabel, type CategoriaDocumento, type Relevancia } from "@/lib/domain/venda-documentos/categorias";
import type { DocumentoTemplateRow, VendaDocumentoRow } from "@/lib/domain/db";

type Pedido =
  | { etapa: "categoria"; titulo: string; opcoes: ChoiceOption[]; resolve: (key: string | null) => void }
  | { etapa: "modelo"; titulo: string; opcoes: ChoiceOption[]; resolve: (key: string | null) => void };

const RELEVANCIA_LABEL: Record<Relevancia, string> = {
  obrigatorio: "Obrigatório",
  recomendado: "Recomendado",
  opcional: "Opcional"
};

/**
 * "Novo documento" em um clique: o vendedor escolhe só a CATEGORIA; se a
 * categoria tiver mais de um template, escolhe qual. Devolve o documento
 * criado (o chamador abre no editor). Renderize `dialogos` uma vez.
 */
export function useNovoDocumento(auth: RequestAuth) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [criando, setCriando] = useState<string | null>(null);
  const pedidoRef = useRef<Pedido | null>(null);

  const perguntar = useCallback((novo: Omit<Pedido, "resolve">) => {
    return new Promise<string | null>((resolve) => {
      const completo = { ...novo, resolve } as Pedido;
      pedidoRef.current = completo;
      setPedido(completo);
    });
  }, []);

  const fechar = useCallback((key: string | null) => {
    const atual = pedidoRef.current;
    pedidoRef.current = null;
    setPedido(null);
    atual?.resolve(key);
  }, []);

  const criarDaCategoria = useCallback(
    async (vendaId: string, categoria: CategoriaDocumento, venda: { temTroca?: boolean } = {}): Promise<VendaDocumentoRow | null> => {
      const templates = await fetchTemplates(auth).catch(() => [] as DocumentoTemplateRow[]);
      const opcoes = opcoesDaCategoria(categoria, templates, Boolean(venda.temTroca));
      let escolhida: OpcaoModelo | null = escolhaAutomatica(opcoes);
      if (!escolhida && opcoes.length > 1) {
        const key = await perguntar({
          etapa: "modelo",
          titulo: `Qual ${categoriaLabel(categoria)}?`,
          opcoes: opcoes.map((opcao) => ({
            key: opcao.key,
            label: opcao.titulo,
            description: opcao.descricao ?? undefined,
            aside: opcao.recomendado ? "Recomendado" : opcao.origem === "sistema" ? "Sistema" : "Loja",
            testId: `novo-doc-modelo-${opcao.key}`
          }))
        });
        escolhida = opcoes.find((opcao) => opcao.key === key) ?? null;
      }
      if (!escolhida) return null;
      setCriando(categoria);
      try {
        return await createDocumento(auth, {
          venda_id: vendaId,
          titulo: categoria === "outro" ? escolhida.titulo : escolhida.origem === "sistema" ? escolhida.titulo : categoriaLabel(categoria),
          conteudo: escolhida.conteudo,
          categoria,
          template_id: escolhida.templateId
        });
      } finally {
        setCriando(null);
      }
    },
    [auth, perguntar]
  );

  /** Pergunta a categoria (com o que é esperado nesta venda) e cria o documento. */
  const escolherECriar = useCallback(
    async (
      vendaId: string,
      relevancias?: Partial<Record<CategoriaDocumento, Relevancia | null>>,
      jaGerados?: Partial<Record<CategoriaDocumento, number>>,
      venda: { temTroca?: boolean } = {}
    ) => {
      const key = await perguntar({
        etapa: "categoria",
        titulo: "Novo documento",
        opcoes: CATEGORIAS.map((categoria) => {
          const relevancia = relevancias?.[categoria.key] ?? null;
          const gerados = jaGerados?.[categoria.key] ?? 0;
          return {
            key: categoria.key,
            label: categoria.label,
            description: categoria.resumo,
            aside: gerados > 0 ? `${gerados} gerado${gerados > 1 ? "s" : ""}` : relevancia ? RELEVANCIA_LABEL[relevancia] : undefined,
            testId: `novo-doc-categoria-${categoria.key}`
          } satisfies ChoiceOption;
        })
      });
      if (!key) return null;
      return criarDaCategoria(vendaId, key as CategoriaDocumento, venda);
    },
    [criarDaCategoria, perguntar]
  );

  const dialogos: ReactNode = pedido ? (
    <ChoiceListDialog
      open
      onClose={() => fechar(null)}
      title={pedido.titulo}
      subtitle={pedido.etapa === "categoria" ? "Escolha a categoria: o documento já nasce com o modelo e os dados da venda." : "Esta categoria tem mais de um modelo."}
      options={pedido.opcoes}
      onChoose={(key) => fechar(key)}
      size="md"
      searchable={false}
      testId={`novo-doc-${pedido.etapa}`}
    />
  ) : null;

  return { criarDaCategoria, escolherECriar, criando, dialogos };
}
