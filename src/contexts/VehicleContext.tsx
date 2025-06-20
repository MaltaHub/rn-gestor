import React, { createContext, useContext, useState, useEffect } from "react";
import { VehicleWithIndicators } from "../types";
import { useAuth } from "./AuthContext";
import { useStore } from "./StoreContext";
import { toast } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useVehiclesData } from "@/hooks/useVehiclesData";
import { useNotifications } from "@/hooks/useNotifications";
import { addVehicle as addVehicleService, updateVehicle as updateVehicleService, deleteVehicle as deleteVehicleService } from "@/services/vehicleService";
import { createVehicleNotification, createSmartVehicleNotification } from "@/services/notificationService";
import { usePermission } from "@/contexts/PermissionContext";
import { mapVehicleWithIndicatorsToVehicle } from "@/utils/vehicleUpdateMapper";

// Filter vehicles for the new structure
const filterVehicles = (vehicles: VehicleWithIndicators[], searchTerm: string, statusFilter: string, sortOption: string): VehicleWithIndicators[] => {
  let filtered = vehicles.filter(vehicle => {
    const matchesSearch = !searchTerm || 
      vehicle.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.color.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Sort vehicles
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
      case 'image_url':
        aValue = a.image_url;
        bValue = b.image_url;
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
};

interface VehicleContextType {
  vehicles: VehicleWithIndicators[];
  addVehicle: (vehicle: Omit<VehicleWithIndicators, 'id' | 'added_at' | 'store' | 'indicador_amarelo' | 'indicador_vermelho' | 'indicador_lilas'>) => Promise<void>;
  updateVehicle: (id: string, updates: Partial<VehicleWithIndicators>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  getVehicle: (id: string) => VehicleWithIndicators | undefined;
  unreadNotificationsCount: number;
  viewMode: 'compact' | 'detailed' | 'table';
  setViewMode: (mode: 'compact' | 'detailed' | 'table') => void;
  sortOption: string;
  setSortOption: (option: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredVehicles: VehicleWithIndicators[];
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  isLoading: boolean;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // User preferences state
  const [viewMode, setViewMode] = useState<'compact' | 'detailed' | 'table'>(() => {
    const savedMode = localStorage.getItem('viewMode');
    return savedMode === 'detailed' || savedMode === 'table' ? savedMode as 'compact' | 'detailed' | 'table' : 'compact';
  });
  
  const [sortOption, setSortOption] = useState<string>(() => {
    const savedSort = localStorage.getItem('sortOption');
    return savedSort || 'addedAt_desc';
  });
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const { user } = useAuth();
  const { currentStore } = useStore();
  const { userRole } = usePermission();
  const queryClient = useQueryClient();
  
  // Data fetching with custom hooks
  const { vehicles, isLoadingVehicles, refetchVehicles } = useVehiclesData();
  const { unreadCount, refetchNotifications } = useNotifications();
  
  const isLoading = isLoadingVehicles;
  
  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
    localStorage.setItem('sortOption', sortOption);
  }, [viewMode, sortOption]);
  
  // Vehicle CRUD operations
  const addVehicle = async (vehicle: Omit<VehicleWithIndicators, 'id' | 'addedAt' | 'store' | 'indicador_amarelo' | 'indicador_vermelho' | 'indicador_lilas'>) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    try {
      // Add the current store to the vehicle data
      const vehicleWithStore = {
        ...vehicle,
        store: currentStore
      };
      
      const newVehicle = await addVehicleService(vehicleWithStore, user.id, currentStore);
      
      // Create notification for new vehicle
      await createVehicleNotification(
        newVehicle.id,
        newVehicle.plate,
        "Novo veículo adicionado",
        `${newVehicle.model} foi adicionado ao estoque da ${currentStore}`
      );
      
      await refetchVehicles();
      await refetchNotifications();
      toast.success("Veículo adicionado com sucesso!");
    } catch (error) {
      console.error("Erro ao adicionar veículo:", error);
      toast.error("Erro ao adicionar veículo");
    }
  };
  
  const updateVehicle = async (id: string, updates: Partial<VehicleWithIndicators>) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    try {
      console.log("VehicleContext - Dados originais recebidos:", updates);
      
      // Filtrar apenas os campos que existem na tabela vehicles
      const filteredUpdates = mapVehicleWithIndicatorsToVehicle(updates);
      console.log("VehicleContext - Dados filtrados para update:", filteredUpdates);

      const { previousState, currentState } = await updateVehicleService(id, filteredUpdates, user.id);

      const changedFields = Object.keys(filteredUpdates).filter(key => {
        const updateKey = key as keyof VehicleWithIndicators;
        const previousValue = previousState[updateKey];
        const newValue = filteredUpdates[updateKey as keyof typeof filteredUpdates];

        // Tratar undefined, null e strings vazias como equivalentes
        const normalize = (value: any) => (value === undefined || value === null || value === '') ? '' : value;
        const normalizedPreviousValue = normalize(previousValue);
        const normalizedNewValue = normalize(newValue);

        // Ignorar campos onde os valores normalizados são idênticos
        if (normalizedPreviousValue === normalizedNewValue) {
          return false;
        }

        // Comparar strings ignorando espaços em branco
        if (typeof normalizedPreviousValue === 'string' && typeof normalizedNewValue === 'string') {
          return normalizedPreviousValue.trim() !== normalizedNewValue.trim();
        }

        // Comparação padrão para outros tipos
        return normalizedPreviousValue !== normalizedNewValue;
      });

      const statusChanged = filteredUpdates.status && filteredUpdates.status !== previousState.status;
      const statusMap = {
        'available': 'Disponível',
        'reserved': 'Reservado',
        'sold': 'Vendido'
      };

      if (statusChanged && changedFields.length === 0) {
        await createVehicleNotification(
          id,
          previousState.plate,
          `Status alterado para ${statusMap[filteredUpdates.status]}`,
          `O status do ${previousState.model} foi alterado para ${statusMap[filteredUpdates.status]}`
        );
      } else if (changedFields.length > 0) {
        const consolidatedMessage = statusChanged
          ? `Status alterado para ${statusMap[filteredUpdates.status]} e ${changedFields.length} outros campos atualizados`
          : `Veículo atualizado`;

        const details = statusChanged
          ? `${changedFields.length} campos do ${previousState.model} foram atualizados, incluindo o status.`
          : `${changedFields.length} campos do ${previousState.model} foram atualizados`;

        await createVehicleNotification(
          id,
          previousState.plate,
          consolidatedMessage,
          details
        );
      }

      await refetchVehicles();
      await refetchNotifications();
      toast.success("Veículo atualizado com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar veículo:", error);
      toast.error("Erro ao atualizar veículo");
    }
  };
  
  const deleteVehicle = async (id: string) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    try {
      await deleteVehicleService(id, user.id, userRole);
      await refetchVehicles();
      toast.success("Veículo removido com sucesso!");
    } catch (error) {
      console.error("Erro ao remover veículo:", error);
      toast.error("Erro ao remover veículo");
    }
  };
  
  const getVehicle = (id: string) => {
    return vehicles.find(vehicle => vehicle.id === id);
  };
  
  // Apply filters and sorting to vehicles
  const filteredVehicles = filterVehicles(vehicles, searchTerm, statusFilter, sortOption);
  
  return (
    <VehicleContext.Provider 
      value={{
        vehicles,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        getVehicle,
        unreadNotificationsCount: unreadCount,
        viewMode,
        setViewMode,
        sortOption,
        setSortOption,
        searchTerm,
        setSearchTerm,
        filteredVehicles,
        statusFilter,
        setStatusFilter,
        isLoading
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
};

export const useVehicles = () => {
  const context = useContext(VehicleContext);
  if (context === undefined) {
    throw new Error('useVehicles must be used within a VehicleProvider');
  }
  return context;
};
