import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type IconName =
  | "refresh"
  | "select-cycle"
  | "hide"
  | "show"
  | "add"
  | "bulk"
  | "trash"
  | "finalize"
  | "rebuild"
  | "left"
  | "right";

export type HolisticChooserOption = {
  key: string;
  label: string;
  description?: string;
  testId?: string;
  disabled?: boolean;
};

export type HolisticChooserActionMap = {
  default?: (key: string) => void | Promise<void>;
  cases?: Record<string, () => void | Promise<void>>;
};

export function ActionIcon({ name }: { name: IconName }) {
  if (name === "refresh") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v6h-6" />
      </svg>
    );
  }

  if (name === "select-cycle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    );
  }

  if (name === "hide") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3 3 18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 5.2A10.3 10.3 0 0 1 12 5c6 0 9.8 7 9.8 7a16.7 16.7 0 0 1-3 3.8" />
        <path d="M6.6 6.7A16.5 16.5 0 0 0 2.2 12S6 19 12 19c1 0 2-.2 2.9-.6" />
      </svg>
    );
  }

  if (name === "show") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.2 12S6 5 12 5s9.8 7 9.8 7-3.8 7-9.8 7-9.8-7-9.8-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === "add") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "bulk") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 4v16" />
      </svg>
    );
  }

  if (name === "trash") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 14h10l1-14" />
      </svg>
    );
  }

  if (name === "finalize") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.2 2.2 4.8-4.8" />
      </svg>
    );
  }

  if (name === "rebuild") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v6h6" />
      </svg>
    );
  }

  if (name === "left") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconButton(props: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  tone?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      className={`sheet-icon-btn ${props.tone === "accent" ? "is-accent" : ""}`}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid={props.testId}
    >
      <ActionIcon name={props.icon} />
      <span className="sr-only">{props.label}</span>
    </button>
  );
}

export function HolisticChooserDialog(props: {
  open: boolean;
  overlayTestId: string;
  dialogTestId: string;
  title: string;
  subtitle?: string;
  options: HolisticChooserOption[];
  loading?: boolean;
  emptyMessage: string;
  closeLabel?: string;
  closeTestId?: string;
  compact?: boolean;
  onClose: () => void;
  actionMap: HolisticChooserActionMap;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setBusyKey(null);
    }
  }, [props.open]);

  const handleOptionClick = useCallback(
    async (optionKey: string) => {
      const dedicatedHandler = props.actionMap.cases?.[optionKey];
      const defaultHandler = props.actionMap.default;
      const handler = dedicatedHandler ?? (defaultHandler ? () => defaultHandler(optionKey) : null);
      if (!handler) return;

      setBusyKey(optionKey);
      try {
        await handler();
        props.onClose();
      } finally {
        setBusyKey(null);
      }
    },
    [props]
  );

  if (!props.open || typeof document === "undefined") return null;

  return createPortal(
    <div className="sheet-focus-overlay" data-testid={props.overlayTestId}>
      <div
        className={`sheet-focus-dialog ${props.compact ? "is-compact" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        data-testid={props.dialogTestId}
      >
        <header className="sheet-focus-dialog-head">
          <div>
            <strong>{props.title}</strong>
            {props.subtitle ? <p>{props.subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="sheet-filter-clear-btn"
            onClick={props.onClose}
            data-testid={props.closeTestId}
          >
            {props.closeLabel ?? "Fechar"}
          </button>
        </header>
        <div className="sheet-focus-dialog-body">
          {props.loading ? (
            <p>Carregando opcoes...</p>
          ) : props.options.length > 0 ? (
            props.options.map((option) => (
              <button
                key={option.key}
                type="button"
                className="sheet-focus-option"
                data-testid={option.testId}
                disabled={option.disabled || busyKey === option.key}
                onClick={() => void handleOptionClick(option.key)}
              >
                <span>{option.label}</span>
                {option.description ? <small>{option.description}</small> : null}
              </button>
            ))
          ) : (
            <p>{props.emptyMessage}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
