
import { useMemo, useCallback } from 'react';
import { useVehiclesData } from './useVehiclesData';
import { useAdvertisements } from './useAdvertisements';
import { useQueryClient } from '@tanstack/react-query';
import { VehicleWithIndicators, PlatformType } from '@/types';

export interface VehiclePendency {
  id: string;
  vehicleId: string;
  plate: string;
  type: 'missing_photos' | 'missing_ads' | 'incomplete_info' | 'document_pending' | 'orphaned_ad';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  missingPlatforms?: PlatformType[];
  store: string;
  createdAt: string;
  relatedAdvertisementId?: string;
}

export interface PendencyStats {
  total: number;
  critical: number;
  byType: {
    missing_photos: number;
    missing_ads: number;
    incomplete_info: number;
    document_pending: number;
    orphaned_ad: number;
  };
  byStore: Record<string, number>;
}

const MAIN_PLATFORMS: PlatformType[] = ['OLX', 'WhatsApp', 'Mercado Livre', 'ICarros'];

export const useVehiclePendencies = () => {
  const { vehicles, isLoadingVehicles, refetchVehicles } = useVehiclesData();
  const { advertisements, refetch: refetchAdvertisements } = useAdvertisements();
  const queryClient = useQueryClient();

  const pendencies = useMemo(() => {
    if (!vehicles.length) return [];

    const detectedPendencies: VehiclePendency[] = [];

    // 1. Detectar anúncios órfãos (sem veículos)
    advertisements.forEach(ad => {
      if (!ad.vehicle_plates || ad.vehicle_plates.length === 0) {
        detectedPendencies.push({
          id: `ad-${ad.id}-orphaned`,
          vehicleId: '',
          plate: 'SEM VEÍCULO',
          type: 'orphaned_ad',
          severity: 'critical',
          title: `Anúncio órfão na ${ad.platform}`,
          description: `Anúncio ${ad.id_ancora} não possui veículos associados. Deve ser corrigido ou removido.`,
          store: ad.store,
          createdAt: ad.created_at,
          relatedAdvertisementId: ad.id
        });
      } else {
        // Verificar se os veículos do anúncio ainda existem
        const invalidPlates = ad.vehicle_plates.filter(plate => 
          !vehicles.some(v => v.plate === plate && v.status === 'available')
        );
        
        if (invalidPlates.length > 0) {
          detectedPendencies.push({
            id: `ad-${ad.id}-invalid-vehicles`,
            vehicleId: '',
            plate: invalidPlates.join(', '),
            type: 'orphaned_ad',
            severity: 'high',
            title: `Anúncio com veículos inválidos na ${ad.platform}`,
            description: `Anúncio ${ad.id_ancora} referencia veículos que não existem ou não estão disponíveis: ${invalidPlates.join(', ')}`,
            store: ad.store,
            createdAt: ad.created_at,
            relatedAdvertisementId: ad.id
          });
        }
      }
    });

    vehicles.forEach((vehicle: VehicleWithIndicators) => {
      // 2. Detectar fotos faltantes
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

      // 3. Detectar anúncios faltantes
      const vehicleAds = advertisements.filter(ad => 
        ad.vehicle_plates && ad.vehicle_plates.includes(vehicle.plate)
      );
      const publishedPlatforms = vehicleAds
        .filter(ad => ad.publicado)
        .map(ad => ad.platform);
      
      const missingPlatforms = MAIN_PLATFORMS.filter(platform => 
        !publishedPlatforms.includes(platform)
      );
      
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

      // 4. Detectar informações incompletas
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

      // 5. Detectar documentação pendente
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
      document_pending: 0,
      orphaned_ad: 0
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

  // Função para invalidar caches quando necessário
  const invalidatePendencies = useCallback(() => {
    console.log('Invalidating pendencies data...');
    refetchVehicles();
    refetchAdvertisements();
    queryClient.invalidateQueries({ queryKey: ['vehicles-with-indicators'] });
    queryClient.invalidateQueries({ queryKey: ['advertisements'] });
  }, [queryClient, refetchVehicles, refetchAdvertisements]);

  return {
    pendencies,
    stats,
    isLoading: isLoadingVehicles,
    invalidatePendencies
  };
};
