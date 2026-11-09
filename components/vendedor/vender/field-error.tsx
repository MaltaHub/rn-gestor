"use client";

import type { ReactNode } from "react";
import styles from "@/components/vendedor/vender/vender.module.css";

/**
 * Pendência atrelada a um campo do fluxo de venda: a mensagem aparece logo
 * ABAIXO do campo e a página rola até ele (scrollToFieldError). Cada campo
 * validável fica num elemento com `data-field-error-anchor="<field>"`.
 */
export type FieldErrorState = { field: string; message: string } | null;

export function FieldError({ fieldError, field }: { fieldError: FieldErrorState; field: string }) {
  if (!fieldError || fieldError.field !== field) return null;
  return (
    <small className={styles.fieldError} role="alert" data-testid={`vender-field-error-${field}`}>
      {fieldError.message}
    </small>
  );
}

/** Rola até o campo pendente e foca o primeiro controle dentro da âncora. */
export function scrollToFieldError(field: string): void {
  if (typeof document === "undefined") return;
  // rAF: deixa a etapa pendente montar antes de localizar a âncora.
  window.requestAnimationFrame(() => {
    const anchor = document.querySelector<HTMLElement>(`[data-field-error-anchor="${field}"]`);
    if (!anchor) return;
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
    anchor.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
  });
}

type Span = 2 | 3 | 4 | 6;
const SPAN: Record<Span, string> = { 2: styles.span2, 3: styles.span3, 4: styles.span4, 6: "" };

/** Campo do fluxo: rótulo, controle, erro de validação (ou o próprio aviso) e dica. */
export function Campo({
  label,
  required,
  span = 6,
  field,
  fieldError,
  erro,
  hint,
  children
}: {
  label: string;
  required?: boolean;
  span?: Span;
  /** Âncora da pendência (validação ao avançar). */
  field?: string;
  fieldError?: FieldErrorState;
  /** Erro imediato do próprio campo (ex.: CPF inválido ao digitar). */
  erro?: string | null;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const pendencia = field && fieldError?.field === field;
  return (
    <label className={`${styles.field} ${SPAN[span]}`.trim()} data-field-error-anchor={field}>
      <span className={styles.label}>
        {label}
        {required ? <em> *</em> : null}
      </span>
      {children}
      {pendencia ? <FieldError fieldError={fieldError ?? null} field={field} /> : erro ? <small className={styles.fieldError}>{erro}</small> : hint ? <small className={styles.fieldHint}>{hint}</small> : null}
    </label>
  );
}
