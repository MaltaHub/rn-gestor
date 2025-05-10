
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNotificationsData } from "@/hooks/useVehiclesData";
import { markAllNotificationsAsRead as markAllNotificationsAsReadService } from "@/services/notificationService";

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Data fetching with custom hooks
  const { notifications, isLoadingNotifications, refetchNotifications } = useNotificationsData();
  
  const markAllNotificationsAsRead = async () => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    try {
      await markAllNotificationsAsReadService(user.id);
      await refetchNotifications();
    } catch (error) {
      console.error("Erro ao marcar notificações como lidas:", error);
      toast.error("Erro ao atualizar notificações");
    }
  };
  
  const unreadNotificationsCount = notifications.filter(n => !n.is_read).length;

  return {
    notifications,
    isLoadingNotifications,
    markAllNotificationsAsRead,
    unreadNotificationsCount,
    refetchNotifications
  };
};
