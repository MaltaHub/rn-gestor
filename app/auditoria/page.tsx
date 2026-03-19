import { AuthenticatedWorkspace } from "@/components/ui-grid/authenticated-workspace";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <AuthenticatedWorkspace
      initialView="grid"
      initialSheetKey="log_alteracoes"
      initialAuditFilters={{
        acao: readSearchParam(resolvedSearchParams.acao),
        autor: readSearchParam(resolvedSearchParams.autor),
        dateFrom: readSearchParam(resolvedSearchParams.date_from),
        dateTo: readSearchParam(resolvedSearchParams.date_to),
        search: readSearchParam(resolvedSearchParams.search),
        searchMode: readSearchParam(resolvedSearchParams.search_mode) as
          | "search"
          | "contains"
          | "exact"
          | "starts"
          | "ends",
        tabela: readSearchParam(resolvedSearchParams.tabela)
      }}
    />
  );
}
