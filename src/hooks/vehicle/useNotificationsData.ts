
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Notification, SupabaseNotification } from "@/types";
import { mapSupabaseNotificationToNotification } from "@/utils/vehicleMappers";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to fetch and manage notifications data
 */
export const useNotificationsData = () => {
  const { user } = useAuth();

  // Fetch notifications data
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

  // Map to application format
  const notifications: Notification[] = supabaseNotifications.map(mapSupabaseNotificationToNotification);

  return {
    notifications,
    isLoadingNotifications,
    refetchNotifications
  };
};
