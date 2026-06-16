/**
 * Botão de WhatsApp das páginas públicas (catálogo/galeria/tarja). Quando o link
 * carrega um vendedor, mostra a FOTO do vendedor (no lugar do ícone) e o NOME
 * substituindo a palavra "WhatsApp"; sem vendedor, cai no ícone + texto padrão.
 * O número (href) é resolvido no servidor (telefone do vendedor ou padrão).
 */
export type WhatsappSeller = { nome: string; foto: string | null };

function WhatsappIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
      <path
        fill="currentColor"
        d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02ZM12.04 20.2h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.35c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.48-1.38-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z"
      />
    </svg>
  );
}

export function WhatsappButton({
  href,
  seller,
  className = "",
  sellerPrefix = "",
  fallbackLabel = "WhatsApp",
  testId
}: {
  href: string;
  seller?: WhatsappSeller | null;
  className?: string;
  /** Prefixo antes do nome do vendedor (ex.: "Tenho interesse — falar com "). */
  sellerPrefix?: string;
  /** Texto quando NÃO há vendedor no link (ex.: "Tenho interesse — falar no WhatsApp"). */
  fallbackLabel?: string;
  testId?: string;
}) {
  const nome = seller?.nome?.trim() || null;
  // Com vendedor: nome (com prefixo) substitui "WhatsApp"; sem vendedor: fallback.
  const label = nome ? `${sellerPrefix}${nome}` : fallbackLabel;

  return (
    <a className={`whatsapp-btn ${className}`.trim()} href={href} target="_blank" rel="noopener noreferrer" data-testid={testId}>
      {seller?.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="whatsapp-btn-avatar" src={seller.foto} alt="" />
      ) : (
        <WhatsappIcon />
      )}
      <span className="whatsapp-btn-label">{label}</span>
    </a>
  );
}
