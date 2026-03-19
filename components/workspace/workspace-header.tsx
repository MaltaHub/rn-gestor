"use client";

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
    { href: "/arquivos", label: "Arquivos" },
    ...(canAccessAudit ? [{ href: "/auditoria", label: "Auditoria" }] : []),
    ...(actor.role === "ADMINISTRADOR" ? [{ href: "/admin/usuarios", label: "Usuarios" }] : []),
    { href: "/perfil", label: "Perfil" }
  ];

  return (
    <header className="workspace-header">
      <div className="workspace-header-band">
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
          <button
            type="button"
            className="workspace-header-link"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }

              router.push("/");
            }}
          >
            Voltar
          </button>
        </nav>

        <div className="workspace-header-side workspace-header-actions">{actions}</div>
      </div>
    </header>
  );
}
