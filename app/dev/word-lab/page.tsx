"use client";

// Rota-laboratorio (sem auth/sem venda) para validar o editor Word em navegador
// real (Playwright: tests/e2e/word-lab.spec.ts). 404 em producao.
// O CSS do vendedor PRECISA entrar aqui (a rota real o recebe via layout do
// /vendedor) — sem ele o lab validava o editor sem o chrome de verdade.
import "@/styles/vendedor.css";
import { notFound } from "next/navigation";
import { WordEditor } from "@/components/vendedor/word/word-editor";

export const dynamic = "force-dynamic";

const CONTENT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Contrato de compra e venda do veiculo placa ABC1D23." }]
    }
  ]
};

export default function WordLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div style={{ padding: 24 }}>
      <WordEditor
        auth={{ accessToken: "dev", devRole: undefined }}
        documentoId="lab"
        initialTitulo="Laboratorio"
        initialConteudo={CONTENT}
        contexto={{ placa: "ABC1D23", valorTotal: 45000, compradorNome: "Joao da Silva" }}
      />
    </div>
  );
}
