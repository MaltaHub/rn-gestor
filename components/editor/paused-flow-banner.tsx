"use client";

import type { Database } from "@/lib/supabase/database.types";

type RunRow = Database["public"]["Tables"]["editor_flow_runs"]["Row"];

export type PausedFlowBannerProps = {
  runs: RunRow[];
  busyRunId: string | null;
  onRelease: (run: RunRow) => void;
  onCancel: (run: RunRow) => void;
};

function pauseSummary(run: RunRow): string {
  // O context guarda { tag_paused: TagPauseInfo } no patch da Fase 6.
  const ctx = (run.context ?? {}) as { tag_paused?: { tag_type?: string; rows_affected?: number } };
  const tag = ctx.tag_paused;
  const tagLabel = tag?.tag_type ?? run.paused_reason ?? "TAG";
  const rows = tag?.rows_affected ?? 0;
  return `${tagLabel} (${rows} linha${rows === 1 ? "" : "s"})`;
}

export function PausedFlowBanner(props: PausedFlowBannerProps) {
  const { runs, busyRunId, onRelease, onCancel } = props;
  if (runs.length === 0) return null;

  return (
    <div className="paused-flow-banner" role="status" data-testid="paused-flow-banner">
      <strong>{runs.length === 1 ? "Fluxo pausado" : `${runs.length} fluxos pausados`}</strong>
      <div className="paused-flow-banner-list">
        {runs.map((run) => (
          <div key={run.id} className="paused-flow-banner-item">
            <div className="paused-flow-banner-info">
              <span className="paused-flow-banner-summary">{pauseSummary(run)}</span>
              <small>{new Date(run.started_at).toLocaleTimeString()}</small>
            </div>
            <div className="paused-flow-banner-actions">
              <button
                type="button"
                className="paused-flow-banner-btn paused-flow-banner-btn-primary"
                onClick={() => onRelease(run)}
                disabled={busyRunId === run.id}
                data-testid={`paused-release-${run.id}`}
              >
                {busyRunId === run.id ? "Aplicando..." : "Liberar"}
              </button>
              <button
                type="button"
                className="paused-flow-banner-btn paused-flow-banner-btn-secondary"
                onClick={() => onCancel(run)}
                disabled={busyRunId === run.id}
                data-testid={`paused-cancel-${run.id}`}
              >
                Cancelar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
