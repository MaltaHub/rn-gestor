"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PlanTable = { table: string; total: number };
type Plan = { tables: PlanTable[]; grand_total: number };
type ChunkResponse = { table: string; offset: number; sent: number; applied: number; total: number; done: boolean };

const CHUNK_LIMIT = 100;

export function BackupBackfillPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const [current, setCurrent] = useState<string>("");
  const [doneByTable, setDoneByTable] = useState<Record<string, number>>({});
  const stopRef = useRef(false);

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    if (!sb) {
      setPlanError("Cliente Supabase indisponivel (env ausente).");
      return;
    }
    void sb.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const authHeaders = useCallback(
    (): Record<string, string> => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }),
    [token]
  );

  const loadPlan = useCallback(async () => {
    setPlanError(null);
    try {
      const res = await fetch("/api/v1/backup/backfill", { headers: authHeaders() });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setPlanError(body?.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      setPlan(body.data as Plan);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err));
    }
  }, [authHeaders]);

  useEffect(() => {
    if (token) void loadPlan();
  }, [token, loadPlan]);

  async function run() {
    if (!plan || running) return;
    setRunning(true);
    setFinished(false);
    setError(null);
    setProcessed(0);
    setDoneByTable({});
    stopRef.current = false;
    try {
      for (const t of plan.tables) {
        if (stopRef.current) break;
        setCurrent(t.table);
        let offset = 0;
        for (;;) {
          if (stopRef.current) break;
          const res = await fetch("/api/v1/backup/backfill", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ table: t.table, offset, limit: CHUNK_LIMIT })
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            setError(`${t.table}: ${body?.error?.message ?? `HTTP ${res.status}`}`);
            stopRef.current = true;
            break;
          }
          const d = body.data as ChunkResponse;
          offset += d.sent;
          setProcessed((x) => x + d.sent);
          setDoneByTable((m) => ({ ...m, [t.table]: offset }));
          if (d.done || d.sent === 0) break;
        }
      }
      if (!stopRef.current) setFinished(true);
    } finally {
      setRunning(false);
      setCurrent("");
    }
  }

  function stop() {
    stopRef.current = true;
  }

  const grand = plan?.grand_total ?? 0;
  const pct = grand > 0 ? Math.min(100, Math.round((processed / grand) * 100)) : finished ? 100 : 0;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "Segoe UI, Roboto, Arial, sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Backup de contenção — backfill</h1>
      <p style={{ color: "#6b7280", margin: "0 0 16px", fontSize: 13 }}>
        Popula a planilha (Apps Script) com os dados que já existem. Em lotes (paced), seguro re-rodar
        (upsert por PK). Requer o Apps Script monólito já publicado.
      </p>

      {planError ? (
        <div style={{ background: "#fdecea", border: "1px solid #f5c6cb", color: "#a12622", padding: 10, borderRadius: 6, fontSize: 13 }}>
          {planError}
          <button onClick={() => void loadPlan()} style={{ marginLeft: 10 }}>tentar de novo</button>
        </div>
      ) : !plan ? (
        <p style={{ color: "#6b7280" }}>Carregando plano…</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 12px" }}>
            <button
              onClick={() => void run()}
              disabled={running || grand === 0}
              style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #1a73e8", background: running ? "#9bbcf0" : "#1a73e8", color: "#fff", cursor: running ? "default" : "pointer", fontSize: 14 }}
            >
              {running ? "Executando…" : "Iniciar backup completo"}
            </button>
            {running ? (
              <button onClick={stop} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #bbb", background: "#fff", cursor: "pointer" }}>
                Parar
              </button>
            ) : null}
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              {grand.toLocaleString("pt-BR")} linha(s) · {plan.tables.length} tabela(s)
            </span>
          </div>

          <div style={{ background: "#eef1f5", borderRadius: 8, height: 18, overflow: "hidden", border: "1px solid #d7dbe0" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: finished ? "#1e8e3e" : "#1a73e8", transition: "width .2s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0 14px", fontSize: 12, color: "#6b7280" }}>
            <span>{processed.toLocaleString("pt-BR")} / {grand.toLocaleString("pt-BR")} ({pct}%)</span>
            <span>{finished ? "✅ Concluído" : running ? `Enviando: ${current}…` : "Pronto"}</span>
          </div>

          {error ? (
            <div style={{ background: "#fdecea", border: "1px solid #f5c6cb", color: "#a12622", padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          ) : null}

          <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
            {plan.tables.map((t) => {
              const sent = doneByTable[t.table] ?? 0;
              const tDone = sent >= t.total && (sent > 0 || t.total === 0) && (finished || sent >= t.total);
              const isCurrent = current === t.table;
              return (
                <div key={t.table} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: "1px solid #f0f0f0", fontSize: 12.5, background: isCurrent ? "#eef3fe" : "transparent" }}>
                  <span>{tDone ? "✅ " : isCurrent ? "⏳ " : ""}{t.table}</span>
                  <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>
                    {sent.toLocaleString("pt-BR")} / {t.total.toLocaleString("pt-BR")}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
