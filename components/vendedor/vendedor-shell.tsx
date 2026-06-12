"use client";

import { useEffect, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { useAuthActionsContext, useAuthSessionState } from "@/components/auth/auth-provider";
import styles from "@/components/ui-grid/ui-grid.module.css";

type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/vendedor", label: "Início", isActive: (p) => p === "/vendedor" || p.startsWith("/vendedor/veiculo") },
  { href: "/vendedor/word", label: "Word", isActive: (p) => p.startsWith("/vendedor/word") },
  { href: "/vendedor/vender", label: "Vender", isActive: (p) => p.startsWith("/vendedor/vender") },
  { href: "/vendedor/perfil", label: "Perfil", isActive: (p) => p.startsWith("/vendedor/perfil") }
];

function buildNextPath(pathname: string, searchParams: { toString(): string }) {
  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * Casca da área /vendedor: faz o gating de sessão (espelha AuthenticatedWorkspace)
 * e renderiza a barra do topo com a navegação própria do vendedor. As páginas
 * filhas leem a sessão via useAuthSessionState (provider é global no root layout).
 */
export function VendedorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { actor, authError, status } = useAuthSessionState();
  const { signOut } = useAuthActionsContext();

  useEffect(() => {
    if (status !== "signed_out") return;
    const nextPath = buildNextPath(pathname || "/vendedor", searchParams);
    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [pathname, router, searchParams, status]);

  if (status === "loading") {
    return (
      <AuthStatusCard
        title="Validando acesso"
        description="Validando a sessao antes de abrir a area do vendedor."
        error={authError}
      />
    );
  }

  if (status === "signed_out") {
    return <AuthStatusCard title="Redirecionando" description="Sessao ausente. Redirecionando para o login." />;
  }

  if (status === "profile_error" || !actor) {
    return (
      <AuthStatusCard
        title="Perfil indisponivel"
        description="A sessao foi validada, mas o perfil da aplicacao nao foi carregado."
        error={authError}
      >
        <button type="button" className={styles.btn} onClick={() => void signOut()}>
          Sair
        </button>
      </AuthStatusCard>
    );
  }

  // O Word ocupa a pagina inteira (barra de ponta a ponta, sem o container).
  const fullBleed = pathname.startsWith("/vendedor/word");

  return (
    <div className="vendedor-shell">
      <header className="vendedor-topbar">
        <Link className="vendedor-topbar-logo" href="/" aria-label="Roberto Automoveis - inicio">
          <Image src="/logo-branca.png" alt="Roberto Automoveis" width={240} height={160} className="vendedor-logo" priority />
        </Link>
        <nav className="vendedor-topbar-nav" aria-label="Navegacao do vendedor">
          {NAV_ITEMS.map((item) => {
            const active = item.isActive(pathname);
            return (
              <button
                key={item.href}
                type="button"
                className={`vendedor-nav-link ${active ? "is-active" : ""}`.trim()}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (pathname === item.href) return;
                  router.push(item.href);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>
      <main className={`vendedor-content ${fullBleed ? "is-full" : ""}`.trim()}>{children}</main>
    </div>
  );
}
