import type { ReactNode } from "react";

type FilesCommandBarSectionProps = {
  actions: ReactNode;
  breadcrumb: ReactNode;
  description: string;
  miniStats?: ReactNode;
  subtitle: string;
  title: string;
};

export function FilesCommandBarSection({
  actions,
  breadcrumb,
  description,
  miniStats,
  subtitle,
  title,
}: FilesCommandBarSectionProps) {
  return (
    <header className="files-dashboard-bar files-command-bar">
      <div className="files-dashboard-head files-command-copy">
        {breadcrumb}
        <div className="files-command-title-row">
          <div className="files-command-title">
            <span className="files-section-kicker">{subtitle}</span>
            <h1>{title}</h1>
            <p className="files-meta-line">{description}</p>
          </div>
          {miniStats}
        </div>
      </div>
      <div className="files-command-actions">{actions}</div>
    </header>
  );
}
