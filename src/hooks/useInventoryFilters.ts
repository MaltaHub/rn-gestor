
import { useState, useMemo } from 'react';
import { VehicleWithIndicators } from '@/types';
import { AdvancedFilterState } from '@/components/inventory/AdvancedFilters';

export const useInventoryFilters = (vehicles: VehicleWithIndicators[]) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOption, setSortOption] = useState('addedAt_desc');
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>({
    priceMin: '',
    priceMax: '',
    yearMin: '',
    yearMax: '',
    mileageMin: '',
    mileageMax: '',
    local: '',
    documentacao: '',
    hasIndicadores: '',
    hasPhotos: ''
  });

  const clearAdvancedFilters = () => {
    setAdvancedFilters({
      priceMin: '',
      priceMax: '',
      yearMin: '',
      yearMax: '',
      mileageMin: '',
      mileageMax: '',
      local: '',
      documentacao: '',
      hasIndicadores: '',
      hasPhotos: ''
    });
  };

  const filteredVehicles = useMemo(() => {
    let filtered = [...vehicles];

    // Filtro básico de status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(vehicle => vehicle.status === statusFilter);
    }

    // Filtro de busca básica
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(vehicle => 
        vehicle.model.toLowerCase().includes(lowerSearchTerm) ||
        vehicle.plate.toLowerCase().includes(lowerSearchTerm) ||
        vehicle.color.toLowerCase().includes(lowerSearchTerm) ||
        (vehicle.description && vehicle.description.toLowerCase().includes(lowerSearchTerm))
      );
    }

    // Filtros avançados
    if (advancedFilters.priceMin) {
      const priceMin = Number(advancedFilters.priceMin);
      filtered = filtered.filter(vehicle => vehicle.price >= priceMin);
    }

    if (advancedFilters.priceMax) {
      const priceMax = Number(advancedFilters.priceMax);
      filtered = filtered.filter(vehicle => vehicle.price <= priceMax);
    }

    if (advancedFilters.yearMin) {
      const yearMin = Number(advancedFilters.yearMin);
      filtered = filtered.filter(vehicle => vehicle.year >= yearMin);
    }

    if (advancedFilters.yearMax) {
      const yearMax = Number(advancedFilters.yearMax);
      filtered = filtered.filter(vehicle => vehicle.year <= yearMax);
    }

    if (advancedFilters.mileageMin) {
      const mileageMin = Number(advancedFilters.mileageMin);
      filtered = filtered.filter(vehicle => vehicle.mileage >= mileageMin);
    }

    if (advancedFilters.mileageMax) {
      const mileageMax = Number(advancedFilters.mileageMax);
      filtered = filtered.filter(vehicle => vehicle.mileage <= mileageMax);
    }

    if (advancedFilters.local) {
      filtered = filtered.filter(vehicle => vehicle.local === advancedFilters.local);
    }

    if (advancedFilters.documentacao) {
      filtered = filtered.filter(vehicle => vehicle.documentacao === advancedFilters.documentacao);
    }

    if (advancedFilters.hasIndicadores === 'true') {
      filtered = filtered.filter(vehicle => 
        vehicle.indicador_amarelo || vehicle.indicador_vermelho || vehicle.indicador_lilas
      );
    } else if (advancedFilters.hasIndicadores === 'false') {
      filtered = filtered.filter(vehicle => 
        !vehicle.indicador_amarelo && !vehicle.indicador_vermelho && !vehicle.indicador_lilas
      );
    }

    if (advancedFilters.hasPhotos === 'false') {
      filtered = filtered.filter(vehicle => 
        (vehicle.store === 'Roberto Automóveis' && !vehicle.fotos_roberto) ||
        (vehicle.store === 'RN Multimarcas' && !vehicle.fotos_rn)
      );
    } else if (advancedFilters.hasPhotos === 'true') {
      filtered = filtered.filter(vehicle => 
        (vehicle.store === 'Roberto Automóveis' && vehicle.fotos_roberto) ||
        (vehicle.store === 'RN Multimarcas' && vehicle.fotos_rn)
      );
    }

    // Ordenação
    const [field, direction] = sortOption.split('_');
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (field) {
        case 'addedAt':
          aValue = new Date(a.added_at);
          bValue = new Date(b.added_at);
          break;
        case 'price':
          aValue = a.price;
          bValue = b.price;
          break;
        case 'year':
          aValue = a.year;
          bValue = b.year;
          break;
        case 'mileage':
          aValue = a.mileage;
          bValue = b.mileage;
          break;
        default:
          aValue = a.model;
          bValue = b.model;
      }

      if (direction === 'desc') {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [vehicles, searchTerm, statusFilter, sortOption, advancedFilters]);

  return {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    sortOption,
    setSortOption,
    advancedFilters,
    setAdvancedFilters,
    clearAdvancedFilters,
    filteredVehicles
  };
};
