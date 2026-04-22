"use client";

import styles from "@/components/auth/auth.module.css";

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
    <main className={styles.authShell}>
      <section className={`${styles.authCard} ${styles.statusCard}`.trim()}>
        <span className={styles.badge}>{badge}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {children}
      </section>
    </main>
  );
}
