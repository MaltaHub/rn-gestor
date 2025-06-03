
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
    // Usar INSERT com ON CONFLICT para marcar como lida
    const { error } = await supabase
      .from('notification_read_status')
      .upsert({
        notification_id: notificationId,
        user_id: userId,
        is_read: true,
        read_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Erro ao marcar notificação como lida:', error);
      toast.error('Erro ao atualizar notificação');
      throw error;
    }

    toast.success('Notificação marcada como lida');
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
    // Apenas marcar como oculta para o usuário, não deletar a notificação global
    // Primeiro, verificar se já existe um registro de leitura
    const { data: existingStatus } = await supabase
      .from('notification_read_status')
      .select('id')
      .eq('notification_id', notificationId)
      .eq('user_id', userId)
      .single();

    if (existingStatus) {
      // Se existe, deletar o registro de status para "ocultar" a notificação
      const { error } = await supabase
        .from('notification_read_status')
        .delete()
        .eq('notification_id', notificationId)
        .eq('user_id', userId);
      
      if (error) {
        console.error('Erro ao excluir status da notificação:', error);
        toast.error('Erro ao excluir notificação');
        throw error;
      }
    } else {
      // Se não existe, criar um registro marcado como "deletado" (is_read = null seria uma opção, 
      // mas vamos usar uma abordagem mais simples: inserir e depois deletar)
      await supabase
        .from('notification_read_status')
        .insert({
          notification_id: notificationId,
          user_id: userId,
          is_read: true,
          read_at: new Date().toISOString()
        });

      // Depois deletar para "ocultar"
      await supabase
        .from('notification_read_status')
        .delete()
        .eq('notification_id', notificationId)
        .eq('user_id', userId);
    }

    toast.success('Notificação removida da sua lista');
    return true;
  } catch (error) {
    console.error("Erro ao excluir notificação:", error);
    toast.error('Erro ao excluir notificação');
    throw error;
  }
};

export const markAllNotificationsAsRead = async (userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    // Buscar todas as notificações não lidas pelo usuário usando a view
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

    // Marcar cada notificação como lida usando upsert
    const insertPromises = notifications.map(notification => 
      supabase
        .from('notification_read_status')
        .upsert({
          notification_id: notification.id,
          user_id: userId,
          is_read: true,
          read_at: new Date().toISOString()
        })
    );

    await Promise.all(insertPromises);
    return true;
  } catch (error) {
    console.error("Erro ao marcar notificações como lidas:", error);
    throw error;
  }
};
