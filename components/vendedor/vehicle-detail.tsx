"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiClientError,
  fetchCarroById,
  fetchVehiclePhotos,
  type VehiclePhotoItem,
  type VendedorCarroDetail
} from "@/components/ui-grid/api";
import { carroDisplayName, formatPreco, readModelo } from "@/components/vendedor/format";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { VehiclePhotoCarousel } from "@/components/vendedor/vehicle-photo-carousel";
import { VehicleDocumentsPanel } from "@/components/vendedor/vehicle-documents-panel";
import { VehicleSaleDialog } from "@/components/vendedor/vehicle-sale-dialog";
import { VehicleSharePhotos } from "@/components/vendedor/vehicle-share-photos";

type Tab = "info" | "documentos";

function readString(carro: VendedorCarroDetail | null, key: string): string | null {
  const value = carro?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(carro: VendedorCarroDetail | null, key: string): number | null {
  const value = carro?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function VehicleDetail({ carroId }: { carroId: string }) {
  const auth = useVendedorAuth();
  const router = useRouter();
  const [carro, setCarro] = useState<VendedorCarroDetail | null>(null);
  const [photos, setPhotos] = useState<VehiclePhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [saleOpen, setSaleOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchCarroById({ requestAuth: auth, carroId }), fetchVehiclePhotos({ requestAuth: auth, carroId })])
      .then(([carroData, photosData]) => {
        if (!active) return;
        setCarro(carroData);
        setPhotos(photosData.photos);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao carregar o veiculo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth, carroId]);

  const name = carro ? carroDisplayName(carro) : "Veiculo";

  const infoRows = useMemo(() => {
    const preco = formatPreco(readNumber(carro, "preco_original"));
    const rows: Array<{ label: string; value: string }> = [];
    const push = (label: string, value: string | number | null) => {
      if (value != null && String(value).trim()) rows.push({ label, value: String(value) });
    };
    push("Placa", readString(carro, "placa"));
    push("Modelo", readModelo(carro?.modelos));
    push("Ano", readNumber(carro, "ano_mod") ?? readNumber(carro, "ano_fab"));
    push("Cor", readString(carro, "cor"));
    push("Hodometro", readNumber(carro, "hodometro"));
    push("Preco", preco);
    push("Local", readString(carro, "local"));
    push("Estado de venda", readString(carro, "estado_venda"));
    return rows;
  }, [carro]);

  return (
    <section className="vendedor-detail">
      <div className="vendedor-detail-topline">
        <button type="button" className="vendedor-btn-ghost" onClick={() => router.push("/vendedor")} data-testid="vendedor-detail-back">
          ← Voltar
        </button>
      </div>

      {error ? <p className="vendedor-error" data-testid="vendedor-detail-error">{error}</p> : null}
      {loading ? <p className="vendedor-hint">Carregando...</p> : null}

      {!loading && !error ? (
        <>
          <VehiclePhotoCarousel photos={photos} alt={name} />

          <div className="vendedor-detail-head">
            <h1 data-testid="vendedor-detail-name">{name}</h1>
            <div className="vendedor-detail-actions">
              <button
                type="button"
                className="vendedor-btn-ghost"
                onClick={() => setShareOpen(true)}
                disabled={photos.length === 0}
                data-testid="vendedor-share-open"
              >
                Compartilhar fotos
              </button>
              <button type="button" className="vendedor-btn-primary" onClick={() => setSaleOpen(true)} data-testid="vendedor-sell-open">
                Vender
              </button>
            </div>
          </div>

          {info ? <p className="vendedor-ok" data-testid="vendedor-detail-info">{info}</p> : null}

          <nav className="vendedor-tabs" aria-label="Secoes do veiculo">
            <button
              type="button"
              className={`vendedor-tab ${tab === "info" ? "is-active" : ""}`.trim()}
              aria-current={tab === "info" ? "page" : undefined}
              onClick={() => setTab("info")}
              data-testid="vendedor-tab-info"
            >
              Informacoes
            </button>
            <button
              type="button"
              className={`vendedor-tab ${tab === "documentos" ? "is-active" : ""}`.trim()}
              aria-current={tab === "documentos" ? "page" : undefined}
              onClick={() => setTab("documentos")}
              data-testid="vendedor-tab-documentos"
            >
              Documentos
            </button>
          </nav>

          {tab === "info" ? (
            <dl className="vendedor-info-grid" data-testid="vendedor-info">
              {infoRows.map((row) => (
                <div key={row.label} className="vendedor-info-item">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <VehicleDocumentsPanel carroId={carroId} />
          )}
        </>
      ) : null}

      {saleOpen ? (
        <VehicleSaleDialog
          carroId={carroId}
          carroName={name}
          onClose={() => setSaleOpen(false)}
          onCreated={() => {
            setSaleOpen(false);
            setInfo("Venda registrada.");
          }}
        />
      ) : null}

      {shareOpen ? <VehicleSharePhotos carroId={carroId} carroName={name} onClose={() => setShareOpen(false)} /> : null}
    </section>
  );
}
