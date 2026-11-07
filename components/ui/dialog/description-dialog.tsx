"use client";

import type { FormEvent, ReactNode, RefObject } from "react";

import { FocusDialog, dialogStyles as styles } from "@/components/ui/dialog/focus-dialog";

/**
 * Form de DESCRIÇÃO padrão (texto livre que justifica/explica uma ação — ex.:
 * contexto da alteração de preço). Mesma casca dos outros forms; o contexto
 * específico da operação entra em `context`.
 */
export function DescriptionDialog(props: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Resumo do que está sendo explicado (ex.: "R$ 50.000 → R$ 48.000"). */
  context?: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  /** Obriga texto antes de confirmar. */
  required?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  testId?: string;
  overlayTestId?: string;
  textTestId?: string;
  submitTestId?: string;
  cancelTestId?: string;
}) {
  const blocked = props.required !== false && props.value.trim() === "";
  return (
    <FocusDialog
      open={props.open}
      onClose={props.onCancel}
      title={props.title}
      subtitle={props.subtitle}
      size="sm"
      testId={props.testId}
      overlayTestId={props.overlayTestId}
      closeOnBackdrop={false}
      initialFocusRef={props.textareaRef}
      onSubmit={(event) => {
        if (blocked) {
          event.preventDefault();
          return;
        }
        props.onSubmit(event);
      }}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={props.onCancel} data-testid={props.cancelTestId}>
            Cancelar
          </button>
          <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={blocked} data-testid={props.submitTestId}>
            {props.submitLabel ?? "Salvar"}
          </button>
        </>
      }
    >
      {props.context ? <p className={styles.contextLine}>{props.context}</p> : null}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{props.label}</span>
        <textarea
          ref={props.textareaRef}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          rows={4}
          placeholder={props.placeholder}
          data-testid={props.textTestId}
        />
      </label>
    </FocusDialog>
  );
}
