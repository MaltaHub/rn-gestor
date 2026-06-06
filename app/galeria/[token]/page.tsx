import "@/styles/galeria.css";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { GaleriaView } from "@/components/vendedor/galeria-view";
import { listVehiclePhotos } from "@/lib/domain/carros/media";
import { isEstadoVendaDisponivel } from "@/lib/domain/carros/service";
import { resolveCarroShareToken } from "@/lib/domain/carros/share";

export const dynamic = "force-dynamic";

// Numero da loja (WhatsApp) para o CTA da galeria publica.
const WHATSAPP_NUMBER = "5513974069303";

function readModelo(modelos: unknown): string | null {
  if (!modelos) return null;
  const entry = Array.isArray(modelos) ? modelos[0] : modelos;
  const modelo = (entry as { modelo?: unknown } | null)?.modelo;
  return typeof modelo === "string" && modelo.trim() ? modelo.trim() : null;
}

function Indisponivel({ message }: { message: string }) {
  return (
    <main className="galeria-shell">
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
    .select("estado_venda, nome, placa, modelos(modelo)")
    .eq("id", resolved.carroId)
    .maybeSingle();

  // O link so vale enquanto o veiculo estiver disponivel (para de funcionar se vendido).
  if (!carro || !isEstadoVendaDisponivel(carro.estado_venda)) {
    return <Indisponivel message="Este veiculo nao esta mais disponivel." />;
  }

  const vehicleName = carro.nome?.trim() || readModelo(carro.modelos) || carro.placa || "Veiculo disponivel";

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
      <GaleriaView vehicleName={vehicleName} whatsappUrl={whatsappUrl} photos={photos} />
    </main>
  );
}
