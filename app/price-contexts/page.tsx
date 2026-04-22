"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-provider";
import { fetchPriceChangeContexts, type PriceChangeContextEntry } from "@/components/ui-grid/api";

function PriceContextsInner() {
  const params = useSearchParams();
  const table = (params.get("table") ?? "").trim();
  const rowId = (params.get("row_id") ?? "").trim();
  const column = (params.get("column") ?? "").trim();
  const { accessToken, actor, devRole } = useAuthSession();
  const requestAuth = useMemo(() => ({ accessToken, devRole }), [accessToken, devRole]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [rows, setRows] = useState<PriceChangeContextEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchPriceChangeContexts({ table, rowId, column, page, pageSize, requestAuth });
        if (!mounted) return;
        setRows(data.rows);
        // total is returned via meta; we can't read it from here without changing parseApi, so we show simple paging
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar contextos.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [column, page, pageSize, requestAuth, rowId, table]);

  return (
    <main className="main-shell">
      <div className="card">
        <h3>Contextos de alteração de preço</h3>
        <p>
          {table ? `Tabela: ${table}` : "Todas as tabelas"}
          {rowId ? ` | Registro: ${rowId}` : ""}
          {column ? ` | Coluna: ${column}` : ""}
        </p>
        {loading ? <p>Carregando...</p> : null}
        {error ? <p className="sheet-error">{error}</p> : null}
        <div className="price-contexts-table-wrap">
          <table className="sheet-grid" data-testid="price-contexts-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Tabela</th>
                <th>Registro</th>
                <th>Coluna</th>
                <th>De</th>
                <th>Para</th>
                <th>Contexto</th>
                <th>Autor</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>Sem registros.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.table_name}</td>
                    <td>{r.row_id}</td>
                    <td>{r.column_name}</td>
                    <td>{r.old_value ?? "(vazio)"}</td>
                    <td>{r.new_value ?? "(vazio)"}</td>
                    <td>{r.context}</td>
                    <td>{r.created_by ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="price-contexts-pager">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Página anterior
          </button>
          <span>Página {page}</span>
          <button type="button" className="btn btn-secondary" onClick={() => setPage((p) => p + 1)} disabled={loading}>
            Próxima página
          </button>
          <label className="sheet-inline-field price-contexts-page-size">
            Tamanho
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
      </div>
    </main>
  );
}

export default function PriceContextsPage() {
  return (
    <Suspense fallback={<main className="main-shell"><div className="card"><p>Carregando...</p></div></main>}>
      <PriceContextsInner />
    </Suspense>
  );
}
