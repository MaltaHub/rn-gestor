
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { Vehicle } from "@/types";
import { useVehiclesData } from "@/hooks/vehicle/useVehiclesData";
import { addVehicle as addVehicleService } from "@/services/vehicle/vehicleAddService";
import { updateVehicle as updateVehicleService } from "@/services/vehicle/vehicleUpdateService";
import { deleteVehicle as deleteVehicleService } from "@/services/vehicle/vehicleDeleteService";

export const useVehicleOperations = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { vehicles, isLoadingVehicles, refetchVehicles } = useVehiclesData();
  
  const addVehicleMutation = useMutation({
    mutationFn: async (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => {
      if (!user) {
        throw new Error("Usuário não autenticado");
      }
      return await addVehicleService(vehicle, user.id);
    },
    onSuccess: () => {
      toast.success("Veículo adicionado com sucesso");
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (error) => {
      console.error("Error adding vehicle:", error);
      toast.error("Erro ao adicionar veículo");
    }
  });
  
  const updateVehicleMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Vehicle> }) => {
      if (!user) {
        throw new Error("Usuário não autenticado");
      }
      return await updateVehicleService(id, updates, user.id);
    },
    onSuccess: () => {
      toast.success("Veículo atualizado com sucesso");
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (error) => {
      console.error("Error updating vehicle:", error);
      toast.error("Erro ao atualizar veículo");
    }
  });
  
  const deleteVehicleMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) {
        throw new Error("Usuário não autenticado");
      }
      return await deleteVehicleService(id, user.id);
    },
    onSuccess: () => {
      toast.success("Veículo excluído com sucesso");
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (error) => {
      console.error("Error deleting vehicle:", error);
      toast.error("Erro ao excluir veículo");
    }
  });

  const addVehicle = async (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => {
    return addVehicleMutation.mutateAsync(vehicle);
  };
  
  const updateVehicle = async (id: string, updates: Partial<Vehicle>) => {
    return updateVehicleMutation.mutateAsync({ id, updates });
  };
  
  const deleteVehicle = async (id: string) => {
    return deleteVehicleMutation.mutateAsync(id);
  };
  
  const getVehicle = (id: string) => {
    return vehicles.find(v => v.id === id);
  };

  return {
    vehicles,
    isLoadingVehicles,
    refetchVehicles,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    getVehicle
  };
};
