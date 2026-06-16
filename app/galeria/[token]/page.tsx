import "@/styles/galeria.css";
import "@/styles/loja-contato.css";
import type { Metadata } from "next";
import Image from "next/image";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { GaleriaView } from "@/components/vendedor/galeria-view";
import { LojaContato } from "@/components/vendedor/loja-contato";
import { listVehiclePhotos } from "@/lib/domain/carros/media";
import { isEstadoVendaDisponivel } from "@/lib/domain/carros/service";
import { resolveCarroShareToken } from "@/lib/domain/carros/share";
import { buildVehicleTitle } from "@/lib/domain/carros/title";
import { buildVehicleFlags } from "@/lib/domain/carros/flags";
import { signPreviewUrlsByFileIds } from "@/lib/files/service";
import { resolveVendedorShareToken } from "@/lib/domain/usuarios/share";
import { loadVendedorContato, resolveWhatsappNumber, WHATSAPP_PADRAO, type VendedorContato } from "@/lib/domain/usuarios/contato";
import type { WhatsappSeller } from "@/components/vendedor/whatsapp-button";

export const dynamic = "force-dynamic";

// Nome da loja para a galeria publica e para o preview do link.
const STORE_NAME = "ROBERTO AUTOMÓVEIS";

function buildWhatsappUrl(numero: string, text: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(text)}`;
}

/** Resolve o vendedor do link (?v=token), se houver, e seu numero de WhatsApp. */
async function resolveSellerFromParam(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  v: string | undefined
): Promise<{ contato: VendedorContato | null; numero: string }> {
  const resolved = v ? resolveVendedorShareToken(decodeURIComponent(v)) : null;
  const contato = resolved ? await loadVendedorContato(supabase, resolved.usuarioId) : null;
  return { contato, numero: resolveWhatsappNumber(contato?.telefone) };
}

function toSeller(contato: VendedorContato | null): WhatsappSeller | null {
  return contato ? { nome: contato.nome, foto: contato.foto } : null;
}

function GaleriaTopbar({ whatsappUrl, seller }: { whatsappUrl: string; seller?: WhatsappSeller | null }) {
  return (
    <header className="galeria-topbar">
      <Image src="/logo-branca.png" alt={STORE_NAME} width={240} height={160} className="galeria-logo" priority />
      <LojaContato whatsappUrl={whatsappUrl} seller={seller} />
    </header>
  );
}

// Preview do link (WhatsApp/redes): capa do veiculo como imagem e a loja como titulo.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const resolved = resolveCarroShareToken(decodeURIComponent(token));
  if (!resolved) {
    return { title: STORE_NAME };
  }

  const supabase = getSupabaseAdmin();
  const { data: carro } = await supabase
    .from("carros")
    .select("estado_venda, nome, placa, ano_mod, ano_fab, hodometro, cor, foto_capa_id, modelos(modelo)")
    .eq("id", resolved.carroId)
    .maybeSingle();

  if (!carro || !isEstadoVendaDisponivel(carro.estado_venda)) {
    return { title: STORE_NAME };
  }

  const description = buildVehicleTitle(carro);

  let imageUrl: string | null = null;
  if (carro.foto_capa_id) {
    try {
      const signed = await signPreviewUrlsByFileIds(supabase, [carro.foto_capa_id]);
      imageUrl = signed[carro.foto_capa_id] ?? null;
    } catch {
      imageUrl = null;
    }
  }

  const images = imageUrl ? [{ url: imageUrl, alt: description }] : undefined;

  return {
    title: STORE_NAME,
    description,
    openGraph: {
      title: STORE_NAME,
      description,
      type: "website",
      images
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: STORE_NAME,
      description,
      images: imageUrl ? [imageUrl] : undefined
    }
  };
}

function Indisponivel({ message }: { message: string }) {
  const whatsappUrl = buildWhatsappUrl(WHATSAPP_PADRAO, "Ola! Tenho interesse em um veiculo.");
  return (
    <main className="galeria-shell">
      <GaleriaTopbar whatsappUrl={whatsappUrl} />
      <div className="galeria-expired">
        <h1>Link indisponivel</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}

export default async function GaleriaPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { token } = await params;
  const { v } = await searchParams;
  const resolved = resolveCarroShareToken(decodeURIComponent(token));

  if (!resolved) {
    return <Indisponivel message="Este link de fotos e invalido." />;
  }

  const supabase = getSupabaseAdmin();

  const { data: carro } = await supabase
    .from("carros")
    .select("estado_venda, nome, placa, ano_mod, ano_fab, hodometro, cor, ano_ipva_pago, tem_manual, tem_chave_r, modelos(modelo)")
    .eq("id", resolved.carroId)
    .maybeSingle();

  // O link so vale enquanto o veiculo estiver disponivel (para de funcionar se vendido).
  if (!carro || !isEstadoVendaDisponivel(carro.estado_venda)) {
    return <Indisponivel message="Este veiculo nao esta mais disponivel." />;
  }

  const vehicleName = buildVehicleTitle(carro);
  const flags = buildVehicleFlags(carro);

  let photos: { id: string; previewUrl: string }[] = [];
  try {
    const result = await listVehiclePhotos(supabase, resolved.carroId);
    photos = result.photos
      .filter((photo) => photo.previewUrl)
      .map((photo) => ({ id: photo.id, previewUrl: photo.previewUrl as string }));
  } catch {
    photos = [];
  }

  // WhatsApp do vendedor do link (?v=), com fallback para o numero padrao da loja.
  const { contato, numero } = await resolveSellerFromParam(supabase, v);
  const seller = toSeller(contato);
  const ctaText = `Ola! Tenho interesse neste veiculo: ${vehicleName}`;
  const whatsappUrl = buildWhatsappUrl(numero, ctaText);

  return (
    <main className="galeria-shell">
      <GaleriaTopbar whatsappUrl={whatsappUrl} seller={seller} />
      <GaleriaView vehicleName={vehicleName} whatsappUrl={whatsappUrl} photos={photos} flags={flags} seller={seller} />
    </main>
  );
}
