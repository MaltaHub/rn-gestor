
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Notification, SupabaseNotification } from "../types";
import { mapSupabaseNotificationToNotification } from "@/utils/vehicleMappers";
import { useAuth } from "@/contexts/AuthContext";
import { 
  markNotificationAsRead as markNotificationAsReadService, 
  hideNotification, 
  restoreNotification, 
  markAllNotificationsAsRead 
} from "@/services/notificationService";

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch notifications data
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

  const markAsRead = async (notificationId: string) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    try {
      await markNotificationAsReadService(notificationId, user.id);
      await refetchNotifications();
    } catch (error) {
      console.error("Erro ao marcar notificação como lida:", error);
    }
  };

  const hideNotificationAction = async (notificationId: string) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    try {
      await hideNotification(notificationId, user.id);
      await refetchNotifications();
    } catch (error) {
      console.error("Erro ao ocultar notificação:", error);
    }
  };

  const restoreNotificationAction = async (notificationId: string) => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    try {
      await restoreNotification(notificationId, user.id);
      await refetchNotifications();
    } catch (error) {
      console.error("Erro ao restaurar notificação:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    try {
      await markAllNotificationsAsRead(user.id);
      await refetchNotifications();
      toast.success('Todas as notificações foram marcadas como lidas');
    } catch (error) {
      console.error("Erro ao marcar todas as notificações como lidas:", error);
      toast.error('Erro ao marcar notificações como lidas');
    }
  };

  const visibleNotifications = notifications.filter(n => !n.is_hidden);
  const hiddenNotifications = notifications.filter(n => n.is_hidden);
  const unreadCount = visibleNotifications.filter(n => !n.is_read).length;
  const hiddenCount = hiddenNotifications.length;

  return {
    notifications: visibleNotifications,
    hiddenNotifications,
    isLoadingNotifications,
    refetchNotifications,
    markAsRead,
    hideNotification: hideNotificationAction,
    restoreNotification: restoreNotificationAction,
    markAllAsRead,
    unreadCount,
    hiddenCount
  };
};
