import { WordWorkspace } from "@/components/vendedor/word/word-workspace";

export const dynamic = "force-dynamic";

export default async function VendedorWordPage({
  searchParams
}: {
  searchParams: Promise<{ venda?: string }>;
}) {
  const { venda } = await searchParams;
  // ?venda=<id> vem do fluxo "Gerar documentos" ao fechar a ficha em /vender:
  // abre direto a sessão (placa) daquele processo.
  return <WordWorkspace initialVendaId={venda ?? null} />;
}
