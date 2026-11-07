"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { FocusDialog, dialogStyles as styles, type FocusDialogSize } from "@/components/ui/dialog/focus-dialog";

/**
 * Lista padrão de escolha (categoria "listas"): busca, setas/Enter, item
 * atual marcado — o mesmo desenho do seletor de coluna do OCR. Usada solta
 * (dentro de popovers, como o filtro de coluna) ou dentro do ChoiceListDialog.
 */
export type ChoiceOption = {
  key: string;
  label: ReactNode;
  /** Texto usado na busca quando `label` não é string. */
  searchText?: string;
  description?: ReactNode;
  testId?: string;
  disabled?: boolean;
  selected?: boolean;
  /** Conteúdo à direita (contagem, código…). */
  aside?: ReactNode;
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function optionText(option: ChoiceOption) {
  const label = typeof option.label === "string" ? option.label : "";
  const description = typeof option.description === "string" ? option.description : "";
  return normalize(`${option.searchText ?? ""} ${label} ${description} ${option.key}`);
}

export function ChoiceList(props: {
  options: ChoiceOption[];
  onChoose: (key: string) => void;
  /** Item em processamento (desabilita enquanto o handler roda). */
  busyKey?: string | null;
  emptyMessage?: string;
  /** Mostrar busca? Padrão: a partir de 8 opções. */
  searchable?: boolean;
  searchPlaceholder?: string;
  searchTestId?: string;
  autoFocus?: boolean;
  /** Conteúdo entre a busca e a lista (atalhos, chips…). */
  header?: ReactNode;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchable = props.searchable ?? props.options.length >= 8;

  const visible = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return props.options;
    return props.options.filter((option) => {
      const haystack = optionText(option);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [props.options, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-cursor="true"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (option: ChoiceOption | undefined) => {
    if (!option || option.disabled || props.busyKey === option.key) return;
    props.onChoose(option.key);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((position) => Math.min(visible.length - 1, position + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((position) => Math.max(0, position - 1));
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      choose(visible[cursor]);
    }
  };

  return (
    <div className={styles.choice} onKeyDown={onKeyDown} data-testid={props.testId}>
      {searchable ? (
        <label className={styles.search}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={props.searchPlaceholder ?? "Buscar…"}
            aria-label="Buscar na lista"
            data-testid={props.searchTestId}
            data-autofocus={props.autoFocus === false ? undefined : true}
          />
        </label>
      ) : null}
      {props.header}
      <div className={styles.list} role="listbox" ref={listRef}>
        {visible.length === 0 ? <p className={styles.hint}>{query ? "Nada encontrado." : props.emptyMessage ?? "Sem opções."}</p> : null}
        {visible.map((option, position) => (
          <button
            key={option.key}
            type="button"
            role="option"
            aria-selected={option.selected ?? false}
            data-cursor={position === cursor ? "true" : undefined}
            className={styles.option}
            disabled={option.disabled || props.busyKey === option.key}
            data-testid={option.testId}
            onMouseEnter={() => setCursor(position)}
            onClick={() => choose(option)}
          >
            <span className={styles.optionMain}>
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </span>
            {option.aside ? <span className={styles.optionAside}>{option.aside}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Escolha numa lista dentro do diálogo padrão (foco preso, Esc, empilha). */
export function ChoiceListDialog(props: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  options: ChoiceOption[];
  onChoose: (key: string) => void;
  busyKey?: string | null;
  loading?: boolean;
  emptyMessage?: string;
  size?: FocusDialogSize;
  testId?: string;
  overlayTestId?: string;
  closeTestId?: string;
  searchable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <FocusDialog
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      subtitle={props.subtitle}
      size={props.size ?? "sm"}
      testId={props.testId}
      overlayTestId={props.overlayTestId}
      closeTestId={props.closeTestId}
      footer={props.footer}
    >
      {props.loading ? (
        <p className={styles.hint}>Carregando opções…</p>
      ) : (
        <ChoiceList
          options={props.options}
          onChoose={props.onChoose}
          busyKey={props.busyKey}
          emptyMessage={props.emptyMessage}
          searchable={props.searchable}
          header={props.header}
        />
      )}
    </FocusDialog>
  );
}
