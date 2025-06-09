
import { useMemo } from 'react';
import { useAdvertisements } from './useAdvertisements';
import { useVehiclesData } from './useVehiclesData';
import { PlatformType } from '@/types';

export interface SmartValidation {
  isPlateAvailableForPlatform: (plate: string, platform: PlatformType) => boolean;
  getAvailablePlatformsForPlate: (plate: string) => PlatformType[];
  getAvailablePlatesForPlatform: (platform: PlatformType) => string[];
  getMissingPlatformsForPlate: (plate: string) => PlatformType[];
  validateAdvertisementCreation: (plates: string[], platform: PlatformType) => {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

const MAIN_PLATFORMS: PlatformType[] = ['OLX', 'WhatsApp', 'Mercado Livre', 'ICarros'];

export const useSmartValidation = (): SmartValidation => {
  const { advertisements } = useAdvertisements();
  const { vehicles } = useVehiclesData();

  const validation = useMemo<SmartValidation>(() => {
    const isPlateAvailableForPlatform = (plate: string, platform: PlatformType): boolean => {
      // Verificar se existe um anúncio publicado para esta placa nesta plataforma
      return !advertisements.some(ad => 
        ad.vehicle_plates.includes(plate) && 
        ad.platform === platform && 
        ad.publicado
      );
    };

    const getAvailablePlatformsForPlate = (plate: string): PlatformType[] => {
      return MAIN_PLATFORMS.filter(platform => 
        isPlateAvailableForPlatform(plate, platform)
      );
    };

    const getAvailablePlatesForPlatform = (platform: PlatformType): string[] => {
      const availableVehicles = vehicles.filter(v => v.status === 'available');
      return availableVehicles
        .map(v => v.plate)
        .filter(plate => isPlateAvailableForPlatform(plate, platform));
    };

    const getMissingPlatformsForPlate = (plate: string): PlatformType[] => {
      const publishedPlatforms = advertisements
        .filter(ad => ad.vehicle_plates.includes(plate) && ad.publicado)
        .map(ad => ad.platform);
      
      return MAIN_PLATFORMS.filter(platform => 
        !publishedPlatforms.includes(platform)
      );
    };

    const validateAdvertisementCreation = (plates: string[], platform: PlatformType) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (plates.length === 0) {
        errors.push('Selecione pelo menos um veículo');
      }

      // Verificar se alguma placa já está anunciada nesta plataforma
      const conflictingPlates = plates.filter(plate => 
        !isPlateAvailableForPlatform(plate, platform)
      );

      if (conflictingPlates.length > 0) {
        errors.push(
          `As placas ${conflictingPlates.join(', ')} já estão anunciadas na ${platform}`
        );
      }

      // Verificar se existem veículos indisponíveis
      const unavailableVehicles = plates.filter(plate => {
        const vehicle = vehicles.find(v => v.plate === plate);
        return !vehicle || vehicle.status !== 'available';
      });

      if (unavailableVehicles.length > 0) {
        warnings.push(
          `Os veículos ${unavailableVehicles.join(', ')} não estão disponíveis`
        );
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    };

    return {
      isPlateAvailableForPlatform,
      getAvailablePlatformsForPlate,
      getAvailablePlatesForPlatform,
      getMissingPlatformsForPlate,
      validateAdvertisementCreation
    };
  }, [advertisements, vehicles]);

  return validation;
};
