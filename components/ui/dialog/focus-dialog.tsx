"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useDialogLayer } from "@/components/ui/dialog/dialog-stack";
import styles from "@/components/ui/dialog/dialog.module.css";

export type FocusDialogSize = "sm" | "md" | "lg" | "xl";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Casca ÚNICA de todo form flutuante do app (registro, confirmação, escolha):
 * foco preso dentro, Esc fecha, foco volta para quem abriu, e o diálogo aberto
 * por último fica na frente. Visual do seletor de coluna do OCR.
 */
export function FocusDialog(props: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Conteúdo extra no cabeçalho (ex.: navegação anterior/próximo). */
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: FocusDialogSize;
  /** Tarja de aviso no cabeçalho (ex.: campos importantes faltando). */
  tone?: "default" | "warning" | "danger";
  testId?: string;
  /** testid do cabeçalho (título + ações). */
  headTestId?: string;
  overlayTestId?: string;
  closeTestId?: string;
  /** Clique fora fecha? (forms com dados digitados preferem não). */
  closeOnBackdrop?: boolean;
  /** Enquanto salva: Esc/fechar ficam bloqueados. */
  busy?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Envolve o corpo+rodapé num <form> (Enter envia). */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  formRef?: RefObject<HTMLFormElement | null>;
  /** Avisado quando o usuário mexe em qualquer campo (para confirmar descarte). */
  onFieldChange?: () => void;
  bodyClassName?: string;
}) {
  const { open, onClose, busy } = props;
  const { isTop, zIndex } = useDialogLayer(open);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Foco inicial e devolução do foco ao fechar.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let firstFocused: Element | null = null;
    const frame = window.requestAnimationFrame(() => {
      const root = dialogRef.current;
      if (!root) return;
      const target =
        props.initialFocusRef?.current ??
        root.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ??
        focusables(root.querySelector(`.${styles.body}`) ?? root)[0] ??
        root;
      target.focus({ preventScroll: true });
      firstFocused = target;
    });
    // Conteúdo que monta depois (dados carregando): o campo marcado como foco
    // inicial ganha o foco quando aparecer — se o usuário ainda não mexeu.
    const retries = [350, 1000].map((delay) =>
      window.setTimeout(() => {
        const root = dialogRef.current;
        const auto = root?.querySelector<HTMLElement>("[autofocus], [data-autofocus]");
        const active = document.activeElement;
        if (auto && active !== auto && (active === firstFocused || active === root || active === document.body)) {
          auto.focus({ preventScroll: true });
          firstFocused = auto;
        }
      }, delay)
    );
    return () => {
      window.cancelAnimationFrame(frame);
      retries.forEach((timer) => window.clearTimeout(timer));
      const opener = openerRef.current;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // initialFocusRef é estável por contrato (ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc fecha só o diálogo do topo; Tab circula dentro dele.
  useEffect(() => {
    if (!open || !isTop) return;
    const onKey = (event: KeyboardEvent) => {
      const root = dialogRef.current;
      if (!root) return;
      if (event.key === "Escape") {
        // Listas/menus dentro do form tratam o próprio Esc (fecham só a lista).
        if (event.target instanceof Element && event.target.closest("[data-dialog-esc='local']")) return;
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, isTop, onClose, open]);

  if (!open || !mounted) return null;

  const body = (
    <>
      <div className={`${styles.body} ${props.bodyClassName ?? ""}`}>{props.children}</div>
      {props.footer ? <footer className={styles.foot}>{props.footer}</footer> : null}
    </>
  );

  return createPortal(
    <div
      className={styles.overlay}
      style={{ zIndex }}
      data-testid={props.overlayTestId}
      data-top={isTop ? "true" : undefined}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (isTop && props.closeOnBackdrop !== false && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        data-size={props.size ?? "md"}
        data-tone={props.tone ?? "default"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={props.testId}
      >
        <header className={styles.head} data-testid={props.headTestId}>
          <div className={styles.titles}>
            <strong id={titleId} className={styles.title}>
              {props.title}
            </strong>
            {props.subtitle ? <small className={styles.subtitle}>{props.subtitle}</small> : null}
          </div>
          {props.headerExtra}
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar"
            title="Fechar (Esc)"
            data-testid={props.closeTestId}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        {props.onSubmit ? (
          <form className={styles.formWrap} onSubmit={props.onSubmit} ref={props.formRef} onChangeCapture={props.onFieldChange} noValidate>
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>,
    document.body
  );
}

export { styles as dialogStyles };
