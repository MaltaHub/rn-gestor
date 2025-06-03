
import React, { createContext, useContext, useState, useEffect } from "react";
import { Vehicle } from "../types";
import { useAuth } from "./AuthContext";
import { toast } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useVehiclesData } from "@/hooks/useVehiclesData";
import { useNotifications } from "@/hooks/useNotifications";
import { addVehicle as addVehicleService, updateVehicle as updateVehicleService, deleteVehicle as deleteVehicleService } from "@/services/vehicleService";
import { createVehicleNotification } from "@/services/notificationService";
import { filterVehicles } from "@/utils/vehicleFilters";

interface VehicleContextType {
  vehicles: Vehicle[];
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => Promise<void>;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  getVehicle: (id: string) => Vehicle | undefined;
  unreadNotificationsCount: number;
  viewMode: 'compact' | 'detailed' | 'table';
  setViewMode: (mode: 'compact' | 'detailed' | 'table') => void;
  sortOption: string;
  setSortOption: (option: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredVehicles: Vehicle[];
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
  const addVehicle = async (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    try {
      const newVehicle = await addVehicleService(vehicle, user.id);
      
      // Create notification for new vehicle
      await createVehicleNotification(
        newVehicle.id,
        newVehicle.plate,
        "Novo veículo adicionado ao estoque",
        `${newVehicle.model} foi adicionado ao estoque`
      );
      
      await refetchVehicles();
      await refetchNotifications();
      toast.success("Veículo adicionado com sucesso!");
    } catch (error) {
      console.error("Erro ao adicionar veículo:", error);
      toast.error("Erro ao adicionar veículo");
    }
  };
  
  const updateVehicle = async (id: string, updates: Partial<Vehicle>) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    try {
      const { previousState, currentState } = await updateVehicleService(id, updates, user.id);
      
      // Check if status changed to create a notification
      if (updates.status && updates.status !== previousState.status) {
        const statusMap = {
          'available': 'Disponível',
          'reserved': 'Reservado',
          'sold': 'Vendido'
        };
        
        await createVehicleNotification(
          id,
          previousState.plate,
          `Status do veículo alterado para ${statusMap[updates.status as keyof typeof statusMap]}`,
          `O status do ${previousState.model} foi alterado de ${
            statusMap[previousState.status as keyof typeof statusMap]
          } para ${
            statusMap[updates.status as keyof typeof statusMap]
          }`
        );
      }
      
      // Create notification for any vehicle update
      if (Object.keys(updates).length > 0) {
        const changedFields = Object.keys(updates).filter(key => key !== 'status').join(', ');
        if (changedFields) {
          await createVehicleNotification(
            id,
            previousState.plate,
            "Veículo atualizado",
            `${previousState.model} teve os seguintes campos atualizados: ${changedFields}`
          );
        }
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
      await deleteVehicleService(id, user.id);
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
