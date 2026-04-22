import type { ReactNode } from "react";

type FilesBrowserToolbarSectionProps = {
  primary: ReactNode;
  secondary: ReactNode;
  mobileHidden: boolean;
};

export function FilesBrowserToolbarSection({
  primary,
  secondary,
  mobileHidden,
}: FilesBrowserToolbarSectionProps) {
  return (
    <section
      className={`files-main-toolbar files-main-toolbar-compact files-mobile-panel ${mobileHidden ? "is-mobile-hidden" : ""}`}
    >
      <div className="files-filter-group files-filter-group-primary">
        {primary}
      </div>
      <div className="files-toolbar-group files-toolbar-group-secondary">
        {secondary}
      </div>
    </section>
  );
}
