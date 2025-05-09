
import React, { createContext, useContext, useState, useEffect } from "react";
import { Vehicle, Notification, SupabaseVehicle, SupabaseNotification } from "../types";
import { useAuth } from "./AuthContext";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface VehicleContextType {
  vehicles: Vehicle[];
  notifications: Notification[];
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => Promise<void>;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  getVehicle: (id: string) => Vehicle | undefined;
  markAllNotificationsAsRead: () => Promise<void>;
  unreadNotificationsCount: number;
  viewMode: 'compact' | 'detailed';
  setViewMode: (mode: 'compact' | 'detailed') => void;
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

// Função auxiliar para converter dados do Supabase para o formato da aplicação
const mapSupabaseVehicleToVehicle = (supabaseVehicle: SupabaseVehicle): Vehicle => {
  return {
    id: supabaseVehicle.id,
    plate: supabaseVehicle.plate,
    model: supabaseVehicle.model,
    color: supabaseVehicle.color,
    mileage: supabaseVehicle.mileage,
    imageUrl: supabaseVehicle.image_url,
    price: supabaseVehicle.price as number,
    year: supabaseVehicle.year,
    description: supabaseVehicle.description,
    specifications: supabaseVehicle.specifications,
    status: supabaseVehicle.status,
    addedAt: supabaseVehicle.added_at,
    user_id: supabaseVehicle.user_id
  };
};

// Função auxiliar para converter dados do Supabase para o formato da aplicação
const mapSupabaseNotificationToNotification = (supabaseNotification: SupabaseNotification): Notification => {
  return {
    id: supabaseNotification.id,
    vehicleId: supabaseNotification.vehicle_id,
    vehicle_plate: supabaseNotification.vehicle_plate,
    message: supabaseNotification.message,
    details: supabaseNotification.details,
    is_read: supabaseNotification.is_read,
    created_at: supabaseNotification.created_at,
    user_id: supabaseNotification.user_id
  };
};

export const VehicleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>(() => {
    const savedMode = localStorage.getItem('viewMode');
    return savedMode === 'detailed' ? 'detailed' : 'compact';
  });
  const [sortOption, setSortOption] = useState<string>(() => {
    const savedSort = localStorage.getItem('sortOption');
    return savedSort || 'addedAt_desc';
  });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Salvar preferências no localStorage
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
    localStorage.setItem('sortOption', sortOption);
  }, [viewMode, sortOption]);

  // Consultas React Query para veículos
  const {
    data: supabaseVehicles = [],
    isLoading: isLoadingVehicles,
    refetch: refetchVehicles
  } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*');
      
      if (error) {
        console.error('Erro ao buscar veículos:', error);
        toast.error('Erro ao buscar veículos');
        return [];
      }
      
      return data as SupabaseVehicle[];
    },
    enabled: true
  });

  // Mapeando para o formato da aplicação
  const vehicles: Vehicle[] = supabaseVehicles.map(mapSupabaseVehicleToVehicle);

  // Consultas React Query para notificações
  const {
    data: supabaseNotifications = [],
    isLoading: isLoadingNotifications,
    refetch: refetchNotifications
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar notificações:', error);
        toast.error('Erro ao buscar notificações');
        return [];
      }
      
      return data as SupabaseNotification[];
    },
    enabled: !!user
  });

  // Mapeando para o formato da aplicação
  const notifications: Notification[] = supabaseNotifications.map(mapSupabaseNotificationToNotification);

  const isLoading = isLoadingVehicles || isLoadingNotifications;

  const addVehicle = async (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    try {
      // Converter de Vehicle para SupabaseVehicle
      const newVehicle = {
        user_id: user.id,
        plate: vehicle.plate,
        model: vehicle.model,
        color: vehicle.color,
        mileage: vehicle.mileage,
        image_url: vehicle.imageUrl,
        price: vehicle.price,
        year: vehicle.year,
        description: vehicle.description,
        specifications: vehicle.specifications,
        status: vehicle.status
      };

      const { data, error } = await supabase
        .from('vehicles')
        .insert(newVehicle)
        .select()
        .single();

      if (error) {
        console.error('Erro ao adicionar veículo:', error);
        toast.error('Erro ao adicionar veículo');
        return;
      }

      // Criar notificação para novo veículo
      const notification = {
        vehicle_id: data.id,
        vehicle_plate: data.plate,
        message: "Novo veículo adicionado ao estoque",
        details: `${data.model} foi adicionado ao estoque`,
        is_read: false,
        user_id: user.id
      };

      await supabase.from('notifications').insert(notification);
      
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
      // Buscar veículo atual para comparação
      const { data: vehicleToUpdate, error: fetchError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', id)
        .single();
      
      if (fetchError) {
        console.error('Erro ao buscar veículo para atualização:', fetchError);
        toast.error('Veículo não encontrado');
        return;
      }

      // Converter de Vehicle para SupabaseVehicle para atualização
      const supabaseUpdates: Partial<SupabaseVehicle> = {};
      
      if (updates.plate) supabaseUpdates.plate = updates.plate;
      if (updates.model) supabaseUpdates.model = updates.model;
      if (updates.color) supabaseUpdates.color = updates.color;
      if (updates.mileage !== undefined) supabaseUpdates.mileage = updates.mileage;
      if (updates.imageUrl) supabaseUpdates.image_url = updates.imageUrl;
      if (updates.price !== undefined) supabaseUpdates.price = updates.price;
      if (updates.year !== undefined) supabaseUpdates.year = updates.year;
      if (updates.description !== undefined) supabaseUpdates.description = updates.description;
      if (updates.specifications) supabaseUpdates.specifications = updates.specifications;
      if (updates.status) supabaseUpdates.status = updates.status;

      // Atualizar veículo
      const { error: updateError } = await supabase
        .from('vehicles')
        .update(supabaseUpdates)
        .eq('id', id);
      
      if (updateError) {
        console.error('Erro ao atualizar veículo:', updateError);
        toast.error('Erro ao atualizar veículo');
        return;
      }

      // Verificar se o status mudou para criar uma notificação
      if (updates.status && updates.status !== vehicleToUpdate.status) {
        const statusMap = {
          'available': 'Disponível',
          'reserved': 'Reservado',
          'sold': 'Vendido'
        };

        const notification = {
          vehicle_id: id,
          vehicle_plate: vehicleToUpdate.plate,
          message: `Status do veículo alterado para ${statusMap[updates.status as keyof typeof statusMap]}`,
          details: `O status do ${vehicleToUpdate.model} foi alterado de ${
            statusMap[vehicleToUpdate.status as keyof typeof statusMap]
          } para ${
            statusMap[updates.status as keyof typeof statusMap]
          }`,
          is_read: false,
          user_id: user.id
        };

        await supabase.from('notifications').insert(notification);
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
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Erro ao remover veículo:', error);
        toast.error('Erro ao remover veículo');
        return;
      }

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

  const markAllNotificationsAsRead = async () => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      
      if (error) {
        console.error('Erro ao marcar notificações como lidas:', error);
        toast.error('Erro ao atualizar notificações');
        return;
      }

      await refetchNotifications();
    } catch (error) {
      console.error("Erro ao marcar notificações como lidas:", error);
      toast.error("Erro ao atualizar notificações");
    }
  };

  const unreadNotificationsCount = notifications.filter(n => !n.is_read).length;

  // Filtragem e ordenação de veículos
  const filteredVehicles = React.useMemo(() => {
    let filtered = [...vehicles];

    // Aplicar filtro de status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(vehicle => vehicle.status === statusFilter);
    }

    // Aplicar filtro de busca
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(vehicle => 
        vehicle.model.toLowerCase().includes(lowerSearchTerm) || 
        vehicle.plate.toLowerCase().includes(lowerSearchTerm) ||
        vehicle.color.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // Aplicar ordenação
    const [sortField, sortDirection] = sortOption.split('_');
    
    return filtered.sort((a, b) => {
      if (sortField === 'price') {
        return sortDirection === 'asc' ? a.price - b.price : b.price - a.price;
      } else if (sortField === 'mileage') {
        return sortDirection === 'asc' ? a.mileage - b.mileage : b.mileage - a.mileage;
      } else if (sortField === 'addedAt') {
        return sortDirection === 'asc' 
          ? new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
          : new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      }
      return 0;
    });
  }, [vehicles, searchTerm, sortOption, statusFilter]);

  return (
    <VehicleContext.Provider 
      value={{
        vehicles,
        notifications,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        getVehicle,
        markAllNotificationsAsRead,
        unreadNotificationsCount,
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
