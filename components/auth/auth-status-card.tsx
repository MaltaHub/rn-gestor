"use client";

type AuthStatusCardProps = {
  badge?: string;
  title: string;
  description: string;
  error?: string | null;
  children?: React.ReactNode;
};

export function AuthStatusCard({
  badge = "RN Gestor",
  title,
  description,
  error = null,
  children
}: AuthStatusCardProps) {
  return (
    <main className="sheet-auth-shell">
      <section className="sheet-auth-card is-status-card">
        <span className="sheet-badge">{badge}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {error ? <p className="sheet-error">{error}</p> : null}
        {children}
      </section>
    </main>
  );
}
