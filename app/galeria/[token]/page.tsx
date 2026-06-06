import "@/styles/galeria.css";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { listVehiclePhotos, type VehiclePhoto } from "@/lib/domain/carros/media";
import { isEstadoVendaDisponivel } from "@/lib/domain/carros/service";
import { resolveCarroShareToken } from "@/lib/domain/carros/share";

export const dynamic = "force-dynamic";

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

  // O link so vale enquanto o veiculo estiver disponivel (para de funcionar se vendido).
  const { data: carro } = await supabase
    .from("carros")
    .select("estado_venda")
    .eq("id", resolved.carroId)
    .maybeSingle();

  if (!carro || !isEstadoVendaDisponivel(carro.estado_venda)) {
    return <Indisponivel message="Este veiculo nao esta mais disponivel." />;
  }

  let photos: VehiclePhoto[] = [];
  try {
    const result = await listVehiclePhotos(supabase, resolved.carroId);
    photos = result.photos;
  } catch {
    photos = [];
  }

  return (
    <main className="galeria-shell">
      <header className="galeria-head">
        <h1>Fotos do veiculo</h1>
        <p>{photos.length > 0 ? `${photos.length} foto(s)` : "Nenhuma foto disponivel."}</p>
      </header>
      {photos.length > 0 ? (
        <div className="galeria-grid">
          {photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.id} src={photo.previewUrl ?? ""} alt={photo.fileName} loading="lazy" />
          ))}
        </div>
      ) : null}
    </main>
  );
}
