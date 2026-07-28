/**
 * Politica de senha da aplicacao — usada tanto na recuperacao por email
 * (/redefinir-senha) quanto na troca com a senha atual (/perfil).
 *
 * O minimo do Supabase para este projeto e' 6; aqui exigimos 8 para nao depender
 * de config remota. Se afrouxar aqui, afrouxa nos dois fluxos de uma vez.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Pagina unica que conclui a recuperacao de senha. Vive aqui (e nao no
 * auth-provider, que e' "use client") porque as rotas de API tambem montam esse
 * redirect — e os dois lados PRECISAM casar com a allow-list do Supabase.
 */
export const PASSWORD_RECOVERY_PATH = "/redefinir-senha";

export type PasswordCheckInput = {
  novaSenha: string;
  confirmacao: string;
  /** Senha atual, quando o fluxo exige (troca pelo perfil). */
  senhaAtual?: string;
};

/** Retorna a mensagem do primeiro problema encontrado, ou null se estiver ok. */
export function validateNewPassword({ novaSenha, confirmacao, senhaAtual }: PasswordCheckInput): string | null {
  if (senhaAtual !== undefined && senhaAtual.length === 0) {
    return "Informe a senha atual.";
  }

  if (novaSenha.length < MIN_PASSWORD_LENGTH) {
    return `A nova senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (novaSenha !== confirmacao) {
    return "As senhas nao conferem.";
  }

  if (senhaAtual !== undefined && senhaAtual === novaSenha) {
    return "A nova senha precisa ser diferente da atual.";
  }

  return null;
}
