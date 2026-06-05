import "@/styles/galeria.css";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { listVehiclePhotos, type VehiclePhoto } from "@/lib/domain/carros/media";
import { resolveCarroShareToken } from "@/lib/domain/carros/share";

export const dynamic = "force-dynamic";

export default async function GaleriaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = resolveCarroShareToken(decodeURIComponent(token));

  if (!resolved) {
    return (
      <main className="galeria-shell">
        <div className="galeria-expired">
          <h1>Link indisponivel</h1>
          <p>Este link de fotos expirou ou e invalido.</p>
        </div>
      </main>
    );
  }

  let photos: VehiclePhoto[] = [];
  try {
    const result = await listVehiclePhotos(getSupabaseAdmin(), resolved.carroId);
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
