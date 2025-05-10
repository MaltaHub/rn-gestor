
import { useState } from "react";
import { Vehicle } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useVehiclesData } from "@/hooks/vehicle/useVehiclesData";
import { addVehicle as addVehicleService, updateVehicle as updateVehicleService, deleteVehicle as deleteVehicleService } from "@/services/vehicleService";
import { createVehicleNotification } from "@/services/notificationService";

export const useVehicleOperations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Data fetching with custom hooks
  const { vehicles, isLoadingVehicles, refetchVehicles } = useVehiclesData();
  
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
        `${newVehicle.model} foi adicionado ao estoque`,
        user.id
      );
      
      await refetchVehicles();
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
      
      // Criar notificações para cada campo alterado
      if (updates.plate && updates.plate !== previousState.plate) {
        await createVehicleNotification(
          id,
          previousState.plate,
          "Placa do veículo alterada",
          `A placa do ${previousState.model} foi alterada de ${previousState.plate} para ${updates.plate}`,
          user.id
        );
      }
      
      if (updates.model && updates.model !== previousState.model) {
        await createVehicleNotification(
          id,
          previousState.plate,
          "Modelo do veículo alterado",
          `O modelo do veículo foi alterado de ${previousState.model} para ${updates.model}`,
          user.id
        );
      }
      
      if (updates.price !== undefined && updates.price !== previousState.price) {
        await createVehicleNotification(
          id,
          previousState.plate,
          "Preço do veículo alterado",
          `O preço do ${previousState.model} foi alterado de R$ ${previousState.price.toLocaleString()} para R$ ${updates.price.toLocaleString()}`,
          user.id
        );
      }
      
      if (updates.mileage !== undefined && updates.mileage !== previousState.mileage) {
        await createVehicleNotification(
          id,
          previousState.plate,
          "Quilometragem do veículo alterada",
          `A quilometragem do ${previousState.model} foi alterada de ${previousState.mileage.toLocaleString()} km para ${updates.mileage.toLocaleString()} km`,
          user.id
        );
      }
      
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
          }`,
          user.id
        );
      }
      
      await refetchVehicles();
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
      // Primeiro obtém os dados do veículo que será excluído
      const vehicleToDelete = vehicles.find(vehicle => vehicle.id === id);
      
      if (vehicleToDelete) {
        // Exclui o veículo
        await deleteVehicleService(id, user.id);
        
        // Cria notificação de exclusão
        await createVehicleNotification(
          id,
          vehicleToDelete.plate,
          "Veículo removido do estoque",
          `O ${vehicleToDelete.model} (placa ${vehicleToDelete.plate}) foi removido do estoque`,
          user.id
        );
        
        await refetchVehicles();
        toast.success("Veículo removido com sucesso!");
      } else {
        toast.error("Veículo não encontrado");
      }
    } catch (error) {
      console.error("Erro ao remover veículo:", error);
      toast.error("Erro ao remover veículo");
    }
  };
  
  const getVehicle = (id: string) => {
    return vehicles.find(vehicle => vehicle.id === id);
  };

  return {
    vehicles,
    isLoadingVehicles,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    getVehicle
  };
};
