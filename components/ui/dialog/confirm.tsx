"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { FocusDialog, dialogStyles as styles } from "@/components/ui/dialog/focus-dialog";

/**
 * Substitutos dos alertas do navegador (window.confirm/prompt/alert), no
 * padrão do app. Chamáveis de qualquer lugar: devolvem Promise e o
 * <DialogHost/> (no layout raiz) desenha o pedido.
 *
 *   if (!(await confirmDialog({ title: "Excluir?", tone: "danger" }))) return;
 *   const nome = await promptDialog({ title: "Novo nome", defaultValue: atual });
 */

type Tone = "primary" | "danger";

type ConfirmRequest = {
  kind: "confirm";
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  resolve: (value: boolean) => void;
};

type PromptRequest = {
  kind: "prompt";
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
  /** Não deixa confirmar vazio. */
  required?: boolean;
  resolve: (value: string | null) => void;
};

type AlertRequest = {
  kind: "alert";
  title: string;
  message?: string;
  okLabel?: string;
  resolve: () => void;
};

type CopyRequest = {
  kind: "copy";
  title: string;
  message?: string;
  value: string;
  resolve: () => void;
};

type DialogRequest = (ConfirmRequest | PromptRequest | AlertRequest | CopyRequest) & { id: number };

let requests: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function push<T extends DialogRequest>(request: Omit<T, "id">) {
  requests = [...requests, { ...request, id: nextId++ } as DialogRequest];
  emit();
}

function settle(id: number) {
  requests = requests.filter((request) => request.id !== id);
  emit();
}

export function confirmDialog(options: Omit<ConfirmRequest, "kind" | "resolve">): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => push<ConfirmRequest & { id: number }>({ kind: "confirm", ...options, resolve }));
}

export function promptDialog(options: Omit<PromptRequest, "kind" | "resolve">): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => push<PromptRequest & { id: number }>({ kind: "prompt", ...options, resolve }));
}

export function alertDialog(options: Omit<AlertRequest, "kind" | "resolve">): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => push<AlertRequest & { id: number }>({ kind: "alert", ...options, resolve }));
}

/** "Copie o link": campo selecionado + botão Copiar (quando o clipboard falha). */
export function copyDialog(options: Omit<CopyRequest, "kind" | "resolve">): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => push<CopyRequest & { id: number }>({ kind: "copy", ...options, resolve }));
}

function useRequests() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requests,
    () => requests
  );
}

function ConfirmView({ request }: { request: ConfirmRequest & { id: number } }) {
  const done = (value: boolean) => {
    settle(request.id);
    request.resolve(value);
  };
  return (
    <FocusDialog
      open
      size="sm"
      title={request.title}
      tone={request.tone === "danger" ? "danger" : "default"}
      onClose={() => done(false)}
      testId="confirm-dialog"
      footer={
        <>
          <button type="button" className={styles.btn} onClick={() => done(false)} data-testid="confirm-dialog-cancel">
            {request.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${request.tone === "danger" ? styles.danger : styles.primary}`}
            onClick={() => done(true)}
            data-testid="confirm-dialog-accept"
            data-autofocus
          >
            {request.confirmLabel ?? "Confirmar"}
          </button>
        </>
      }
    >
      {request.message ? <p className={styles.message}>{request.message}</p> : null}
    </FocusDialog>
  );
}

function PromptView({ request }: { request: PromptRequest & { id: number } }) {
  const [value, setValue] = useState(request.defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = (result: string | null) => {
    settle(request.id);
    request.resolve(result);
  };
  const blocked = request.required !== false && value.trim() === "";
  useEffect(() => {
    window.requestAnimationFrame(() => inputRef.current?.select());
  }, []);
  return (
    <FocusDialog
      open
      size="sm"
      title={request.title}
      onClose={() => done(null)}
      testId="prompt-dialog"
      initialFocusRef={inputRef}
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) done(value);
      }}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={() => done(null)} data-testid="prompt-dialog-cancel">
            Cancelar
          </button>
          <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={blocked} data-testid="prompt-dialog-accept">
            {request.confirmLabel ?? "OK"}
          </button>
        </>
      }
    >
      {request.message ? <p className={styles.message}>{request.message}</p> : null}
      <label className={styles.field}>
        {request.label ? <span className={styles.fieldLabel}>{request.label}</span> : null}
        {request.multiline ? (
          <textarea ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder={request.placeholder} data-testid="prompt-dialog-input" />
        ) : (
          <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder={request.placeholder} data-testid="prompt-dialog-input" />
        )}
      </label>
    </FocusDialog>
  );
}

function AlertView({ request }: { request: AlertRequest & { id: number } }) {
  const done = () => {
    settle(request.id);
    request.resolve();
  };
  return (
    <FocusDialog
      open
      size="sm"
      title={request.title}
      onClose={done}
      testId="alert-dialog"
      footer={
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={done} data-testid="alert-dialog-ok" data-autofocus>
          {request.okLabel ?? "Entendi"}
        </button>
      }
    >
      {request.message ? <p className={styles.message}>{request.message}</p> : null}
    </FocusDialog>
  );
}

function CopyView({ request }: { request: CopyRequest & { id: number } }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = () => {
    settle(request.id);
    request.resolve();
  };
  useEffect(() => {
    window.requestAnimationFrame(() => inputRef.current?.select());
  }, []);
  return (
    <FocusDialog
      open
      size="sm"
      title={request.title}
      onClose={done}
      testId="copy-dialog"
      initialFocusRef={inputRef}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={done}>
            Fechar
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.primary}`}
            onClick={() => {
              inputRef.current?.select();
              void navigator.clipboard
                ?.writeText(request.value)
                .then(() => setCopied(true))
                .catch(() => {
                  // sem permissão de clipboard: o texto já está selecionado para Ctrl+C
                  document.execCommand?.("copy");
                  setCopied(true);
                });
            }}
            data-testid="copy-dialog-copy"
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
        </>
      }
    >
      {request.message ? <p className={styles.message}>{request.message}</p> : null}
      <input ref={inputRef} readOnly value={request.value} onFocus={(event) => event.currentTarget.select()} data-testid="copy-dialog-value" />
    </FocusDialog>
  );
}

/** Montado uma vez no layout raiz. */
export function DialogHost() {
  const list = useRequests();
  return (
    <>
      {list.map((request) =>
        request.kind === "confirm" ? (
          <ConfirmView key={request.id} request={request} />
        ) : request.kind === "prompt" ? (
          <PromptView key={request.id} request={request} />
        ) : request.kind === "alert" ? (
          <AlertView key={request.id} request={request} />
        ) : (
          <CopyView key={request.id} request={request} />
        )
      )}
    </>
  );
}
