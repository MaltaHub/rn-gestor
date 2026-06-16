import { TELEFONE_PADRAO_LABEL, TELEFONE_PADRAO_TEL } from "@/lib/domain/usuarios/contato";
import { WhatsappButton, type WhatsappSeller } from "@/components/vendedor/whatsapp-button";

// Contato da loja na tarja (catalogo e galeria publica): telefone + botao de
// WhatsApp. O NUMERO do WhatsApp nao aparece mais aqui (so o telefone fixo); o
// botao leva ao vendedor do link (foto + nome) ou ao numero padrao da loja.
export function LojaContato({ whatsappUrl, seller }: { whatsappUrl: string; seller?: WhatsappSeller | null }) {
  return (
    <div className="loja-contato">
      <a className="loja-contato-item" href={`tel:${TELEFONE_PADRAO_TEL}`} aria-label={`Telefone ${TELEFONE_PADRAO_LABEL}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
          <path
            fill="currentColor"
            d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.28.67-.36 1.02-.25 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.24.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2Z"
          />
        </svg>
        <span>{TELEFONE_PADRAO_LABEL}</span>
      </a>
      <WhatsappButton href={whatsappUrl} seller={seller} className="is-tarja" testId="loja-contato-whatsapp" />
    </div>
  );
}
