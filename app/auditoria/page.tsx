import type { AuditFilterDefaults } from "@/components/audit/audit-explorer";
import { AuthenticatedWorkspace } from "@/components/ui-grid/authenticated-workspace";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/** Filtros do endereço (/auditoria?tabela=…&q=…): a API valida cada um. */
function readAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilterDefaults {
  const acao = readSearchParam(params.acao);
  const origem = readSearchParam(params.origem);
  return {
    tabela: readSearchParam(params.tabela),
    acao: acao === "INSERT" || acao === "UPDATE" || acao === "DELETE" ? acao : "",
    origem: origem === "usuario" || origem === "sistema" ? origem : "",
    autor: readSearchParam(params.autor),
    q: readSearchParam(params.q),
    de: readSearchParam(params.de),
    ate: readSearchParam(params.ate),
    lote: readSearchParam(params.lote),
    pk: readSearchParam(params.pk)
  };
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <AuthenticatedWorkspace
      initialView="grid"
      initialSheetKey="log_alteracoes"
      initialAuditFilters={readAuditFilters(resolvedSearchParams)}
    />
  );
}
