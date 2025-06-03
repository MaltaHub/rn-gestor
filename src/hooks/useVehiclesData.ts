
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Vehicle, SupabaseVehicle, SupabaseNotification, Notification } from "../types";
import { mapSupabaseVehicleToVehicle, mapSupabaseNotificationToNotification } from "@/utils/vehicleMappers";
import { useAuth } from "@/contexts/AuthContext";

export const useVehiclesData = () => {
  const { user } = useAuth();

  // Fetch vehicles data
  const {
    data: supabaseVehicles = [],
    isLoading: isLoadingVehicles,
    refetch: refetchVehicles
  } = useQuery({
    queryKey: ['vehicles', user?.id],
    queryFn: async () => {
      if (!user) {
        console.log('Usuário não autenticado - não buscando veículos');
        return [];
      }

      console.log('Buscando veículos para usuário:', user.id);
      const { data, error } = await supabase
        .from('vehicles')
        .select('*');
      
      if (error) {
        console.error('Erro ao buscar veículos:', error);
        toast.error('Erro ao buscar veículos');
        return [];
      }
      
      console.log('Veículos encontrados:', data?.length || 0);
      return data as SupabaseVehicle[];
    },
    enabled: !!user,
    retry: 1
  });

  // Map to application format
  const vehicles: Vehicle[] = supabaseVehicles.map(mapSupabaseVehicleToVehicle);

  return {
    vehicles,
    isLoadingVehicles,
    refetchVehicles
  };
};

export const useNotificationsData = () => {
  const { user } = useAuth();

  // Fetch notifications data using the new view that includes read status
  const {
    data: supabaseNotifications = [],
    isLoading: isLoadingNotifications,
    refetch: refetchNotifications
  } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) {
        console.log('Usuário não autenticado - não buscando notificações');
        return [];
      }
      
      console.log('Buscando notificações para usuário:', user.id);
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar notificações:', error);
        toast.error('Erro ao buscar notificações');
        return [];
      }
      
      console.log('Notificações encontradas:', data?.length || 0);
      return data as SupabaseNotification[];
    },
    enabled: !!user,
    retry: 1
  });

  // Map to application format
  const notifications: Notification[] = supabaseNotifications.map(mapSupabaseNotificationToNotification);

  return {
    notifications,
    isLoadingNotifications,
    refetchNotifications
  };
};
