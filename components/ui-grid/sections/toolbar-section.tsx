import { ReactNode, useState } from "react";

type ToolbarSectionProps = {
  id: string;
  title: string;
  description?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
};

export function ToolbarSection({ id, title, description, defaultExpanded = true, children }: ToolbarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const bodyId = `${id}-toolbar-body`;
  return (
    <section className={`sheet-toolbar-section ${isExpanded ? "is-expanded" : "is-collapsed"}`} data-testid={`toolbar-${id}`}>
      <header className="sheet-toolbar-section-head">
        <div className="sheet-toolbar-section-title">
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
        <button
          type="button"
          className="sheet-toolbar-section-toggle"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-controls={bodyId}
        >
          {isExpanded ? "Recolher" : "Expandir"}
          <span aria-hidden="true" className="sheet-toolbar-section-toggle-icon">
            {isExpanded ? "-" : "+"}
          </span>
        </button>
      </header>
      <div id={bodyId} className="sheet-toolbar-section-body" hidden={!isExpanded}>
        {children}
      </div>
    </section>
  );
}
