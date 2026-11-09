import { WordWorkspace } from "@/components/vendedor/word/word-workspace";

export const dynamic = "force-dynamic";

export default async function VendedorWordPage({
  searchParams
}: {
  searchParams: Promise<{ carro?: string; doc?: string }>;
}) {
  const { carro, doc } = await searchParams;
  // ?carro=<id> abre a placa; &doc=<id> abre o documento (links do /vender).
  return <WordWorkspace initialCarroId={carro ?? null} initialDocId={doc ?? null} />;
}
