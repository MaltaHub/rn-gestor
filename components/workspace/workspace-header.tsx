"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { CurrentActor } from "@/components/ui-grid/types";
import styles from "@/components/workspace/workspace-header.module.css";

type WorkspaceHeaderProps = {
  actor: CurrentActor;
  title: string;
  actions?: ReactNode;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Cabeçalho único das páginas internas: voltar, logo (atalho do vendedor) e
 * as abas. No celular fica numa linha só e as abas rolam de lado.
 */
export function WorkspaceHeader({ actor, title, actions }: WorkspaceHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const canAccessAudit = actor.role === "GERENTE" || actor.role === "ADMINISTRADOR";
  const navItems = [
    { href: "/", label: "Home" },
    { href: "/playground", label: "Playground" },
    { href: "/arquivos", label: "Arquivos" },
    { href: "/vendedor", label: "Vendedor" },
    ...(canAccessAudit ? [{ href: "/auditoria", label: "Auditoria" }] : []),
    ...(actor.role === "ADMINISTRADOR" ? [{ href: "/admin/usuarios", label: "Usuários" }] : []),
    { href: "/perfil", label: "Perfil" }
  ];

  return (
    <header className={`${styles.header} workspace-header`}>
      <button
        type="button"
        className={styles.back}
        aria-label="Voltar"
        title="Voltar"
        onClick={() => {
          if (window.history.length > 1) {
            router.back();
            return;
          }
          router.push("/");
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
      </button>

      <Link className={styles.logo} href="/vendedor" aria-label="Ir para a área do vendedor">
        <Image src="/logo-branca.png" alt="RN Gestor" width={240} height={160} className={styles.logoImg} priority />
      </Link>

      {/* A aba ativa já diz onde o usuário está: título só para leitor de tela. */}
      <h1 className="sr-only">{title}</h1>

      <nav className={styles.nav} aria-label="Navegacao principal">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <button
              key={item.href}
              type="button"
              className={`${styles.link} ${active ? styles.linkActive : ""} workspace-header-link`}
              aria-current={active ? "page" : undefined}
              data-testid={`nav-${item.href === "/" ? "home" : item.href.slice(1).replace(/\//g, "-")}`}
              onClick={() => {
                if (!active) router.push(item.href);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
