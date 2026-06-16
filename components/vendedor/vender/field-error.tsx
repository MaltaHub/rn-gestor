"use client";

/**
 * Erro de validação atrelado a um campo específico do wizard de vendas.
 * Quando o avanço é bloqueado, a mensagem aparece logo ABAIXO do campo pendente
 * (não num `<p>` genérico no topo) e a página rola até ele (scrollToFieldError).
 *
 * Cada campo validável envolve seu controle num elemento com
 * `data-field-error-anchor="<field>"` e renderiza `<FieldError field="<field>" />`.
 */
export type FieldErrorState = { field: string; message: string } | null;

export function FieldError({ fieldError, field }: { fieldError: FieldErrorState; field: string }) {
  if (!fieldError || fieldError.field !== field) return null;
  return (
    <small className="vender-field-error" role="alert" data-testid={`vender-field-error-${field}`}>
      {fieldError.message}
    </small>
  );
}

/** Rola até o campo pendente e foca o primeiro controle dentro da âncora. */
export function scrollToFieldError(field: string): void {
  if (typeof document === "undefined") return;
  // rAF: deixa o step pendente montar antes de localizar a âncora.
  window.requestAnimationFrame(() => {
    const anchor = document.querySelector<HTMLElement>(`[data-field-error-anchor="${field}"]`);
    if (!anchor) return;
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
    anchor.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
  });
}
