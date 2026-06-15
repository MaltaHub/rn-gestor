"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { CurrentActor } from "@/components/ui-grid/types";

type WorkspaceHeaderProps = {
  actor: CurrentActor;
  title: string;
  actions?: ReactNode;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

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
    ...(actor.role === "ADMINISTRADOR" ? [{ href: "/admin/usuarios", label: "Usuarios" }] : []),
    { href: "/perfil", label: "Perfil" }
  ];

  return (
    <header className="workspace-header">
      <div className="workspace-header-band">
        {/* Voltar = só um ícone, à esquerda e fora do label do título. */}
        <button
          type="button"
          className="workspace-header-back"
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
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>

        {/* Label preto no meio com a logo — atalho para a área do vendedor. */}
        <Link className="workspace-header-logo" href="/vendedor" aria-label="Ir para a área do vendedor">
          <Image src="/logo-branca.png" alt="RN Gestor" width={240} height={160} className="workspace-header-logo-img" priority />
        </Link>

        <div className="workspace-header-side">
          <span className="workspace-header-title">{title}</span>
        </div>

        <nav className="workspace-header-nav" aria-label="Navegacao principal">
          {navItems.map((item) => (
            <button
              key={item.href}
              type="button"
              className={`workspace-header-link ${isActivePath(pathname, item.href) ? "is-active" : ""}`}
              aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
              onClick={() => {
                if (pathname === item.href) return;
                router.push(item.href);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="workspace-header-side workspace-header-actions">{actions}</div>
      </div>
    </header>
  );
}
