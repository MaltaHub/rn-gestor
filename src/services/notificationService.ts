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

export const deleteNotification = async (notificationId: string, userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    // Primeiro, remover o status de leitura se existir
    await supabase
      .from('notification_read_status')
      .delete()
      .eq('notification_id', notificationId)
      .eq('user_id', userId);

    // Depois, deletar a notificação (se for a única referência)
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);
    
    if (error) {
      console.error('Erro ao excluir notificação:', error);
      toast.error('Erro ao excluir notificação');
      throw error;
    }

    toast.success('Notificação excluída com sucesso');
    return true;
  } catch (error) {
    console.error("Erro ao excluir notificação:", error);
    throw error;
  }
};

export const markAllNotificationsAsRead = async (userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    // Buscar todas as notificações não lidas pelo usuário
    const { data: notifications, error: fetchError } = await supabase
      .from('user_notifications')
      .select('id')
      .eq('is_read', false);
    
    if (fetchError) {
      console.error('Erro ao buscar notificações:', fetchError);
      toast.error('Erro ao buscar notificações');
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      return true; // Não há notificações para marcar como lidas
    }

    // Marcar cada notificação como lida individualmente
    for (const notification of notifications) {
      const { error } = await supabase
        .from('notification_read_status')
        .upsert({
          notification_id: notification.id,
          user_id: userId,
          is_read: true,
          read_at: new Date().toISOString()
        });

      if (error) {
        console.error('Erro ao marcar notificação como lida:', error);
        // Continua tentando marcar as outras mesmo se uma falhar
      }
    }

    return true;
  } catch (error) {
    console.error("Erro ao marcar notificações como lidas:", error);
    throw error;
  }
};
