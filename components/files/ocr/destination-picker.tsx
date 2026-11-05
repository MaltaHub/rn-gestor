"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/files/explorer/explorer-icons";
import styles from "@/components/files/ocr/ocr.module.css";
import type { OcrCatalogColumn, OcrCatalogTable, OcrColumnType } from "@/lib/domain/ocr/catalog";
import { resolveOcrDestination } from "@/lib/domain/ocr/destinations";

const RECENTS_KEY = "rn-gestor.ocr.recentDestinations.v1";

const TYPE_BADGE: Record<OcrColumnType, string> = { string: "Aa", number: "123", boolean: "S/N", date: "data", unknown: "·" };

const SPECIALS = [
  { key: "none", label: "Só extrair", hint: "Mostra o valor, não grava" },
  { key: "check.placa", label: "Conferir placa da pasta", hint: "Trava: recusa se não bater" }
];

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function readRecents(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string) {
  try {
    const next = [key, ...readRecents().filter((entry) => entry !== key)].slice(0, 6);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // sem storage: só não lembra os recentes
  }
}

/**
 * Escolha do destino do registro: qualquer coluna editável das tabelas ligadas
 * ao veículo (catálogo do servidor), com busca, recentes e abas por tabela.
 */
export function DestinationPicker({
  value,
  catalog,
  onChange
}: {
  value: string;
  catalog: OcrCatalogTable[] | null;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>("carros");
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const current = resolveOcrDestination(value, catalog);

  useEffect(() => {
    if (!open) return;
    setRecents(readRecents());
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const options = useMemo(() => {
    const tables = catalog ?? [];
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return (tables.find((table) => table.table === tab) ?? tables[0])?.columns ?? [];
    const all: OcrCatalogColumn[] = tables.flatMap((table) => table.columns);
    return all.filter((column) => {
      const tableLabel = tables.find((table) => table.table === column.table)?.label ?? "";
      const haystack = normalize(`${column.label} ${column.column} ${tableLabel}`);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [catalog, query, tab]);

  useEffect(() => setCursor(0), [query, tab]);

  const choose = (key: string) => {
    onChange(key);
    if (key !== "none") pushRecent(key);
    setOpen(false);
    setQuery("");
  };

  const tableLabel = (table: string) => catalog?.find((entry) => entry.table === table)?.label ?? table;

  return (
    <div className={styles.picker} ref={rootRef}>
      <button
        type="button"
        className={styles.pickerTrigger}
        onClick={() => setOpen((state) => !state)}
        aria-expanded={open}
        data-testid="ocr-field-destination"
        data-value={value}
      >
        <span className={styles.pickerKind} data-kind={current.kind}>
          {current.kind === "write" ? "grava" : current.kind === "check" ? "trava" : "lê"}
        </span>
        <span className={styles.pickerValue}>
          {current.kind === "write" && current.column ? (
            <>
              <strong>{current.label.replace(/ \(.*\)$/, "")}</strong>
              <small>{current.tableLabel ?? tableLabel(current.table ?? "")}</small>
            </>
          ) : (
            <strong>{current.label}</strong>
          )}
        </span>
        <Icon name="chevronDown" size={12} />
      </button>

      {open ? (
        <div className={styles.pickerPanel} role="dialog" aria-label="Destino do registro" ref={panelRef}>
          <label className={styles.pickerSearch}>
            <Icon name="search" size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar coluna (ex.: renavam, transferência…)"
              data-testid="ocr-destination-search"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCursor((position) => Math.min(options.length - 1, position + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCursor((position) => Math.max(0, position - 1));
                } else if (event.key === "Enter" && options[cursor]) {
                  event.preventDefault();
                  choose(options[cursor].key);
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
          </label>

          {!query ? (
            <>
              <div className={styles.pickerChips}>
                {SPECIALS.map((special) => (
                  <button
                    key={special.key}
                    type="button"
                    className={`${styles.pickerChip} ${value === special.key ? styles.pickerChipOn : ""}`}
                    onClick={() => choose(special.key)}
                    title={special.hint}
                  >
                    {special.label}
                  </button>
                ))}
              </div>
              {recents.length > 0 ? (
                <div className={styles.pickerChips} aria-label="Recentes">
                  <span className={styles.pickerHint}>Recentes</span>
                  {recents.map((key) => {
                    const destination = resolveOcrDestination(key, catalog);
                    return destination.kind === "write" ? (
                      <button key={key} type="button" className={styles.pickerChip} onClick={() => choose(key)}>
                        {destination.label}
                      </button>
                    ) : null;
                  })}
                </div>
              ) : null}
              <div className={styles.pickerTabs} role="tablist">
                {(catalog ?? []).map((table) => (
                  <button
                    key={table.table}
                    type="button"
                    role="tab"
                    aria-selected={tab === table.table}
                    className={`${styles.pickerTab} ${tab === table.table ? styles.pickerTabOn : ""}`}
                    onClick={() => setTab(table.table)}
                  >
                    {table.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className={styles.pickerList} role="listbox">
            {catalog === null ? <p className={styles.pickerHint}>Carregando colunas…</p> : null}
            {catalog !== null && options.length === 0 ? <p className={styles.pickerHint}>Nenhuma coluna encontrada.</p> : null}
            {options.map((column, position) => (
              <button
                key={column.key}
                type="button"
                role="option"
                aria-selected={column.key === value}
                className={`${styles.pickerOption} ${position === cursor ? styles.pickerOptionCursor : ""} ${column.key === value ? styles.pickerOptionOn : ""}`}
                onMouseEnter={() => setCursor(position)}
                onClick={() => choose(column.key)}
                data-testid={`ocr-destination-${column.key}`}
              >
                <span className={styles.pickerType}>{TYPE_BADGE[column.type]}</span>
                <span className={styles.pickerOptionLabel}>
                  {column.label}
                  {query ? <small> · {tableLabel(column.table)}</small> : null}
                </span>
                <code>{column.column}</code>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
