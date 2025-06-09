
import { useMemo } from 'react';
import { useVehiclesData } from './useVehiclesData';
import { useAdvertisements } from './useAdvertisements';
import { VehicleWithIndicators, PlatformType } from '@/types';

export interface VehiclePendency {
  id: string;
  vehicleId: string;
  plate: string;
  type: 'missing_photos' | 'missing_ads' | 'incomplete_info' | 'document_pending';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  missingPlatforms?: PlatformType[];
  store: string;
  createdAt: string;
}

export interface PendencyStats {
  total: number;
  critical: number;
  byType: {
    missing_photos: number;
    missing_ads: number;
    incomplete_info: number;
    document_pending: number;
  };
  byStore: Record<string, number>;
}

const MAIN_PLATFORMS: PlatformType[] = ['OLX', 'WhatsApp', 'Mercado Livre', 'ICarros'];

export const useVehiclePendencies = () => {
  const { vehicles, isLoadingVehicles } = useVehiclesData();
  const { advertisements } = useAdvertisements();

  const pendencies = useMemo(() => {
    if (!vehicles.length) return [];

    const detectedPendencies: VehiclePendency[] = [];

    vehicles.forEach((vehicle: VehicleWithIndicators) => {
      // 1. Detectar fotos faltantes
      const needsPhotos = (vehicle.store === 'Roberto Automóveis' && !vehicle.fotos_roberto) ||
                         (vehicle.store === 'RN Multimarcas' && !vehicle.fotos_rn);
      
      if (needsPhotos) {
        detectedPendencies.push({
          id: `${vehicle.id}-photos`,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          type: 'missing_photos',
          severity: 'critical',
          title: `Fotos necessárias - ${vehicle.plate}`,
          description: `Veículo ${vehicle.model} precisa de fotos para a loja ${vehicle.store}`,
          store: vehicle.store,
          createdAt: vehicle.added_at
        });
      }

      // 2. Detectar anúncios faltantes
      const vehicleAds = advertisements.filter(ad => ad.vehicle_plates.includes(vehicle.plate));
      const publishedPlatforms = vehicleAds.filter(ad => ad.publicado).map(ad => ad.platform);
      const missingPlatforms = MAIN_PLATFORMS.filter(platform => !publishedPlatforms.includes(platform));
      
      if (missingPlatforms.length > 0) {
        detectedPendencies.push({
          id: `${vehicle.id}-ads`,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          type: 'missing_ads',
          severity: missingPlatforms.length > 2 ? 'critical' : 'high',
          title: `Anúncios faltantes - ${vehicle.plate}`,
          description: `Faltam anúncios em ${missingPlatforms.length} plataforma(s): ${missingPlatforms.join(', ')}`,
          missingPlatforms,
          store: vehicle.store,
          createdAt: vehicle.added_at
        });
      }

      // 3. Detectar informações incompletas
      const incompleteInfo = !vehicle.description || vehicle.description.trim().length < 50;
      
      if (incompleteInfo) {
        detectedPendencies.push({
          id: `${vehicle.id}-info`,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          type: 'incomplete_info',
          severity: 'medium',
          title: `Informações incompletas - ${vehicle.plate}`,
          description: `Veículo ${vehicle.model} precisa de descrição mais detalhada`,
          store: vehicle.store,
          createdAt: vehicle.added_at
        });
      }

      // 4. Detectar documentação pendente
      const pendingDocs = ['Fazendo Laudo', 'Vistoria', 'Transferência', 'IPVA Atrasado', 'Multas Pendentes'];
      
      if (vehicle.documentacao && pendingDocs.includes(vehicle.documentacao)) {
        detectedPendencies.push({
          id: `${vehicle.id}-docs`,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          type: 'document_pending',
          severity: vehicle.documentacao === 'IPVA Atrasado' ? 'critical' : 'high',
          title: `Documentação pendente - ${vehicle.plate}`,
          description: `Status: ${vehicle.documentacao}. Acompanhar processo.`,
          store: vehicle.store,
          createdAt: vehicle.added_at
        });
      }
    });

    return detectedPendencies.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [vehicles, advertisements]);

  const stats = useMemo<PendencyStats>(() => {
    const byType = {
      missing_photos: 0,
      missing_ads: 0,
      incomplete_info: 0,
      document_pending: 0
    };

    const byStore: Record<string, number> = {};
    let critical = 0;

    pendencies.forEach(pendency => {
      byType[pendency.type]++;
      byStore[pendency.store] = (byStore[pendency.store] || 0) + 1;
      if (pendency.severity === 'critical') critical++;
    });

    return {
      total: pendencies.length,
      critical,
      byType,
      byStore
    };
  }, [pendencies]);

  return {
    pendencies,
    stats,
    isLoading: isLoadingVehicles
  };
};
