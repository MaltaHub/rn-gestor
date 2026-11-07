"use client";

import { useEffect, useMemo, useState } from "react";

import { FocusDialog, dialogStyles } from "@/components/ui/dialog/focus-dialog";
import {
  groupInsightsByKey,
  groupInsightsByPlate,
  type GridInsightOccurrence
} from "@/lib/domain/grid-insights";
import styles from "@/components/ui-grid/insights/insights-dialog.module.css";

type InsightsMode = "fila" | "pesquisa";

const MODE_KEY = "grid:v1:insights-mode";

function readMode(): InsightsMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "pesquisa" ? "pesquisa" : "fila";
  } catch {
    return "fila";
  }
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Painel ÚNICO de insights da tabela ativa, em dois modos:
 *  - Fila: um card por problema, com a quantidade e o caso da vez; resolveu,
 *    sai da fila e o card passa a descrever o próximo;
 *  - Pesquisa: busca pela placa → placas com problema → problemas da placa.
 * A última etapa de cada modo leva até a linha no grid.
 */
export function InsightsDialog(props: {
  open: boolean;
  onClose: () => void;
  tableLabel: string;
  occurrences: GridInsightOccurrence[];
  /** Leva o grid até a linha (fecha o painel). */
  onReveal: (rowId: string) => void;
  /** Seleciona todas as linhas de um problema (ações em massa). */
  onSelectRows: (rowIds: string[]) => void;
  /** Anúncios: marcar o insight da linha como verificado. */
  onVerify?: (occurrence: GridInsightOccurrence) => Promise<void>;
}) {
  const { occurrences, onReveal } = props;
  const [mode, setMode] = useState<InsightsMode>("fila");
  const [cursorByKey, setCursorByKey] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [plate, setPlate] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Reabrir começa do início do modo lembrado (lista de placas, não a última placa).
  useEffect(() => {
    if (!props.open) return;
    setMode(readMode());
    setPlate(null);
  }, [props.open]);

  const groups = useMemo(() => groupInsightsByKey(occurrences), [occurrences]);
  const plates = useMemo(() => groupInsightsByPlate(occurrences, query), [occurrences, query]);
  const plateOccurrences = plate ? plates.find((group) => group.placa === plate)?.occurrences ?? [] : [];

  // Placa resolvida por completo: volta para a lista de placas.
  useEffect(() => {
    if (plate && plateOccurrences.length === 0) setPlate(null);
  }, [plate, plateOccurrences.length]);

  function changeMode(next: InsightsMode) {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // sem storage: o modo vale só agora
    }
  }

  function step(key: string, size: number, delta: number) {
    setCursorByKey((prev) => ({ ...prev, [key]: (((prev[key] ?? 0) + delta) % size + size) % size }));
  }

  async function verify(occurrence: GridInsightOccurrence) {
    if (!props.onVerify) return;
    setBusyKey(occurrence.key);
    try {
      await props.onVerify(occurrence);
    } finally {
      setBusyKey(null);
    }
  }

  const total = occurrences.length;

  return (
    <FocusDialog
      open={props.open}
      onClose={props.onClose}
      title={`Insights — ${props.tableLabel}`}
      subtitle={total > 0 ? `${total} ocorrência(s) em ${groups.length} problema(s).` : "Nenhuma pendência no momento."}
      size="md"
      testId="insights-dialog"
      overlayTestId="insights-dialog-overlay"
      closeTestId="insights-dialog-close"
      headerExtra={
        <div className={styles.modes} role="tablist" aria-label="Modo de visão">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "fila"}
            className={styles.mode}
            onClick={() => changeMode("fila")}
            data-testid="insights-mode-fila"
          >
            Fila
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "pesquisa"}
            className={styles.mode}
            onClick={() => changeMode("pesquisa")}
            data-testid="insights-mode-pesquisa"
          >
            Pesquisa
          </button>
        </div>
      }
    >
      {total === 0 ? (
        <p className={styles.empty} data-testid="insights-empty">
          Tudo em dia — sem insights para esta tabela.
        </p>
      ) : mode === "fila" ? (
        <div className={styles.queue}>
          {groups.map((group) => {
            const size = group.occurrences.length;
            const index = Math.min(cursorByKey[group.key] ?? 0, size - 1);
            const current = group.occurrences[index];
            const id = safeId(group.key);
            return (
              <article key={group.key} className={styles.card} data-tone={group.tone} data-testid={`insight-${id}`}>
                <header className={styles.cardHead}>
                  <strong>{group.title}</strong>
                  <span className={styles.count} data-testid={`insight-count-${id}`}>
                    {size}
                  </span>
                </header>
                <button
                  type="button"
                  className={styles.caseBtn}
                  onClick={() => onReveal(current.rowId)}
                  title="Ir até a linha no grid"
                  data-testid={`insight-go-${id}`}
                >
                  {current.placa ? <span className={styles.plate}>{current.placa}</span> : null}
                  <span className={styles.detail}>{current.detail}</span>
                  <span className={styles.goHint} aria-hidden="true">
                    Ir para a linha →
                  </span>
                </button>
                <footer className={styles.cardFoot}>
                  {size > 1 ? (
                    <span className={styles.pager}>
                      <button type="button" onClick={() => step(group.key, size, -1)} aria-label="Caso anterior" data-testid={`insight-prev-${id}`}>
                        ‹
                      </button>
                      <span>
                        {index + 1}/{size}
                      </span>
                      <button type="button" onClick={() => step(group.key, size, 1)} aria-label="Próximo caso" data-testid={`insight-next-${id}`}>
                        ›
                      </button>
                    </span>
                  ) : null}
                  <span className={dialogStyles.spacer} />
                  {props.onVerify && current.anuncioCode && !current.rowId.startsWith("missing:") ? (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => void verify(current)}
                      disabled={busyKey === group.key}
                      data-testid={`insight-verify-${id}`}
                    >
                      {busyKey === group.key ? "Marcando…" : "Marcar verificado"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => props.onSelectRows(Array.from(new Set(group.occurrences.map((entry) => entry.rowId))))}
                    data-testid={`insight-select-${id}`}
                  >
                    Selecionar {size}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      ) : plate ? (
        <div className={styles.searchStep}>
          <button type="button" className={styles.back} onClick={() => setPlate(null)} data-testid="insights-back">
            ‹ Placas
          </button>
          <strong className={styles.plateTitle}>{plate}</strong>
          <div className={dialogStyles.list} role="listbox">
            {plateOccurrences.map((occurrence) => (
              <button
                key={`${occurrence.key}-${occurrence.rowId}`}
                type="button"
                className={`${dialogStyles.option} ${styles.occurrence}`}
                data-tone={occurrence.tone}
                onClick={() => onReveal(occurrence.rowId)}
                data-testid={`insights-plate-item-${safeId(occurrence.key)}`}
              >
                <span className={dialogStyles.optionMain}>
                  {occurrence.title}
                  <small>{occurrence.detail}</small>
                </span>
                <span className={dialogStyles.optionAside}>Ir →</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={dialogStyles.choice}>
          <label className={dialogStyles.search}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar placa"
              aria-label="Pesquisar placa"
              data-autofocus
              data-testid="insights-search"
            />
          </label>
          {plates.length === 0 ? (
            <p className={dialogStyles.hint}>Nenhuma placa com insight para esta busca.</p>
          ) : (
            <div className={dialogStyles.list} role="listbox">
              {plates.map((group) => (
                <button
                  key={group.placa}
                  type="button"
                  className={dialogStyles.option}
                  onClick={() => setPlate(group.placa)}
                  data-testid={`insights-plate-${safeId(group.placa)}`}
                >
                  <span className={dialogStyles.optionMain}>
                    <span className={styles.plate}>{group.placa}</span>
                    <small>{Array.from(new Set(group.occurrences.map((entry) => entry.title))).join(" · ")}</small>
                  </span>
                  <span className={dialogStyles.optionAside}>{group.occurrences.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </FocusDialog>
  );
}
