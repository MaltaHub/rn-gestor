import "@/styles/galeria.css";
import "@/styles/loja-contato.css";
import Image from "next/image";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { GaleriaView } from "@/components/vendedor/galeria-view";
import { LojaContato } from "@/components/vendedor/loja-contato";
import { listVehiclePhotos } from "@/lib/domain/carros/media";
import { isEstadoVendaDisponivel } from "@/lib/domain/carros/service";
import { resolveCarroShareToken } from "@/lib/domain/carros/share";
import { buildVehicleTitle } from "@/lib/domain/carros/title";

export const dynamic = "force-dynamic";

// Numero da loja (WhatsApp) para o CTA da galeria publica.
const WHATSAPP_NUMBER = "5513974069303";

function GaleriaTopbar() {
  return (
    <header className="galeria-topbar">
      <Image src="/logo.png" alt="Logo" width={120} height={80} className="galeria-logo" priority />
      <LojaContato />
    </header>
  );
}

function Indisponivel({ message }: { message: string }) {
  return (
    <main className="galeria-shell">
      <GaleriaTopbar />
      <div className="galeria-expired">
        <h1>Link indisponivel</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}

export default async function GaleriaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = resolveCarroShareToken(decodeURIComponent(token));

  if (!resolved) {
    return <Indisponivel message="Este link de fotos e invalido." />;
  }

  const supabase = getSupabaseAdmin();

  const { data: carro } = await supabase
    .from("carros")
    .select("estado_venda, nome, placa, ano_mod, ano_fab, hodometro, cor, modelos(modelo)")
    .eq("id", resolved.carroId)
    .maybeSingle();

  // O link so vale enquanto o veiculo estiver disponivel (para de funcionar se vendido).
  if (!carro || !isEstadoVendaDisponivel(carro.estado_venda)) {
    return <Indisponivel message="Este veiculo nao esta mais disponivel." />;
  }

  const vehicleName = buildVehicleTitle(carro);

  let photos: { id: string; previewUrl: string }[] = [];
  try {
    const result = await listVehiclePhotos(supabase, resolved.carroId);
    photos = result.photos
      .filter((photo) => photo.previewUrl)
      .map((photo) => ({ id: photo.id, previewUrl: photo.previewUrl as string }));
  } catch {
    photos = [];
  }

  const ctaText = `Ola! Tenho interesse neste veiculo: ${vehicleName}`;
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(ctaText)}`;

  return (
    <main className="galeria-shell">
      <GaleriaTopbar />
      <GaleriaView vehicleName={vehicleName} whatsappUrl={whatsappUrl} photos={photos} />
    </main>
  );
}
