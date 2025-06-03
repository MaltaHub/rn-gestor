
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export const createVehicleNotification = async (
  vehicleId: string,
  vehiclePlate: string,
  message: string,
  details: string
) => {
  try {
    const notification = {
      vehicle_id: vehicleId,
      vehicle_plate: vehiclePlate,
      message,
      details
    };

    console.log("Criando notificação:", notification);

    const { data, error } = await supabase.from('notifications').insert(notification).select().single();
    
    if (error) {
      console.error('Erro ao criar notificação:', error);
      return null;
    }
    
    console.log("Notificação criada com sucesso:", data);
    return data;
  } catch (error) {
    console.error("Erro ao criar notificação:", error);
    return null;
  }
};

export const markNotificationAsRead = async (notificationId: string, userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    const { error } = await supabase.rpc('mark_notification_as_read', {
      notification_id: notificationId,
      user_id: userId
    });
    
    if (error) {
      console.error('Erro ao marcar notificação como lida:', error);
      toast.error('Erro ao atualizar notificação');
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Erro ao marcar notificação como lida:", error);
    throw error;
  }
};

export const markAllNotificationsAsRead = async (userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    const { error } = await supabase.rpc('mark_all_notifications_as_read', {
      user_id: userId
    });
    
    if (error) {
      console.error('Erro ao marcar notificações como lidas:', error);
      toast.error('Erro ao atualizar notificações');
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Erro ao marcar notificações como lidas:", error);
    throw error;
  }
};
