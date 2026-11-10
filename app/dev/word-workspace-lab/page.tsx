"use client";

// Rota-laboratorio do WORKSPACE do Word (barra fixa, lista de placas, painel).
// As APIs sao mockadas pelo Playwright via page.route —
// tests/e2e/word-workspace-lab.spec.ts. 404 em producao.
import "@/styles/vendedor.css";
import { notFound } from "next/navigation";
import { WordWorkspace } from "@/components/vendedor/word/word-workspace";

export default function WordWorkspaceLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // Altura fixa como a do shell do /vendedor: a lista de placas rola por dentro.
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <WordWorkspace authOverride={{ accessToken: "lab", devRole: undefined }} />
    </div>
  );
}
