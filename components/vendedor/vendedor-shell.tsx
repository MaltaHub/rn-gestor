"use client";

import { useEffect, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { useAuthActionsContext, useAuthSessionState } from "@/components/auth/auth-provider";
import { Icon, type IconName } from "@/components/vendedor/ui/icons";
import styles from "@/components/vendedor/shell.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  isActive: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/vendedor", label: "Início", icon: "home", isActive: (p) => p === "/vendedor" || p.startsWith("/vendedor/veiculo") },
  { href: "/vendedor/vender", label: "Vender", icon: "sale", isActive: (p) => p.startsWith("/vendedor/vender") },
  { href: "/vendedor/word", label: "Word", icon: "file", isActive: (p) => p.startsWith("/vendedor/word") },
  { href: "/vendedor/perfil", label: "Perfil", icon: "user", isActive: (p) => p.startsWith("/vendedor/perfil") }
];

// Telas que ocupam a altura toda e rolam por dentro (painéis lado a lado).
const FULL_ROUTES = ["/vendedor/vender", "/vendedor/word"];

function buildNextPath(pathname: string, searchParams: { toString(): string }) {
  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * Casca da área /vendedor: faz o gating de sessão (espelha AuthenticatedWorkspace),
 * desenha a tarja com a navegação (abas embaixo no celular) e trava a rolagem da
 * página — quem rola é o conteúdo. As páginas leem a sessão via useAuthSessionState.
 */
export function VendedorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/vendedor";
  const searchParams = useSearchParams();
  const { actor, authError, status } = useAuthSessionState();
  const { signOut } = useAuthActionsContext();

  useEffect(() => {
    if (status !== "signed_out") return;
    router.replace(`/login?next=${encodeURIComponent(buildNextPath(pathname, searchParams))}`);
  }, [pathname, router, searchParams, status]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(styles.locked);
    return () => root.classList.remove(styles.locked);
  }, []);

  if (status === "loading") {
    return <AuthStatusCard title="Validando acesso" description="Validando a sessão antes de abrir a área do vendedor." error={authError} />;
  }

  if (status === "signed_out") {
    return <AuthStatusCard title="Redirecionando" description="Sessão ausente. Redirecionando para o login." />;
  }

  if (status === "profile_error" || !actor) {
    return (
      <AuthStatusCard title="Perfil indisponível" description="A sessão foi validada, mas o perfil da aplicação não foi carregado." error={authError}>
        <button type="button" className="vendedor-btn-ghost" onClick={() => void signOut()}>
          Sair
        </button>
      </AuthStatusCard>
    );
  }

  const full = FULL_ROUTES.some((route) => pathname.startsWith(route));

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.logoLink} href="/vendedor" aria-label="Roberto Automóveis — início">
          <Image src="/logo-branca.png" alt="Roberto Automóveis" width={240} height={160} className={styles.logo} priority />
        </Link>
        <nav className={styles.nav} aria-label="Navegação do vendedor">
          {NAV_ITEMS.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                aria-current={active ? "page" : undefined}
                data-testid={`vendedor-nav-${item.icon}`}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <span className={styles.spacer} />
        <span className={styles.who} title={actor.userName ?? undefined}>
          {actor.userName}
        </span>
      </header>
      <main className={styles.main} data-full={full ? "true" : undefined}>
        {children}
      </main>
    </div>
  );
}
