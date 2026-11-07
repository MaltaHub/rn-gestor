"use client";

import type { ReactNode } from "react";

import styles from "@/components/ui-grid/record-form.module.css";

export { styles as recordFormStyles };

/**
 * Peças do interior dos forms de registro (form principal do grid e o form de
 * cadastro aberto pelo "+"): rótulo legível em cima, campo de 36px, ações
 * pequenas no rótulo e botões na mesma linha do campo.
 */
export function FormField(props: {
  /** id do controle (o rótulo aponta para ele). */
  inputId: string;
  label: string;
  /** Nome técnico da coluna (aparece ao parar o mouse no rótulo). */
  column?: string;
  /** Ações pequenas ao lado do rótulo (ex.: contexto de preço). */
  actions?: ReactNode;
  full?: boolean;
  plate?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  hintTone?: "muted" | "error";
}) {
  const className = [styles.field, props.full ? styles.full : "", props.plate ? styles.plate : ""].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <div className={styles.labelRow}>
        <label htmlFor={props.inputId} className={styles.label} title={props.column && props.column !== props.label ? props.column : undefined}>
          {props.label}
        </label>
        {props.actions}
      </div>
      {props.children}
      {props.hint ? <p className={props.hintTone === "error" ? styles.error : styles.hint}>{props.hint}</p> : null}
    </div>
  );
}

/** Sim/não como interruptor (o checkbox continua sendo o controle real). */
export function ToggleField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
  disabled?: boolean;
  column?: string;
}) {
  return (
    <label className={styles.toggle} title={props.column && props.column !== props.label ? props.column : undefined}>
      <span>{props.label}</span>
      <input
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        disabled={props.disabled}
        data-testid={props.testId}
      />
    </label>
  );
}

/** Grupo de campos em cartão. Com `onToggle`, o cabeçalho abre/fecha o grupo. */
export function FormGroup(props: {
  title: string;
  meta?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  testId?: string;
  children: ReactNode;
}) {
  const collapsible = Boolean(props.onToggle);
  const open = collapsible ? Boolean(props.open) : true;
  return (
    <section className={styles.group} data-collapsible={collapsible ? "true" : undefined} data-open={open ? "true" : "false"}>
      {collapsible ? (
        <button type="button" className={styles.groupHead} onClick={props.onToggle} aria-expanded={open} data-testid={props.testId}>
          <span className={styles.groupTitle}>{props.title}</span>
          {props.meta ? <span className={styles.groupMeta}>{props.meta}</span> : null}
          <svg className={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ) : (
        <header className={styles.groupHead} data-testid={props.testId}>
          <span className={styles.groupTitle}>{props.title}</span>
          {props.meta ? <span className={styles.groupMeta}>{props.meta}</span> : null}
        </header>
      )}
      {open ? <div className={styles.groupBody}>{props.children}</div> : null}
    </section>
  );
}

export function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/**
 * Rótulo das opções de uma FK: só o nome; o código entra apenas quando dois
 * registros têm o mesmo nome (para dar para distinguir).
 */
export function optionLabelsWithoutKeys<T extends { value: string; label: string }>(options: T[]) {
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.label, (counts.get(option.label) ?? 0) + 1);
  return options.map((option) => ({
    ...option,
    label: (counts.get(option.label) ?? 0) > 1 ? `${option.label} · ${option.value.slice(0, 8)}` : option.label
  }));
}
