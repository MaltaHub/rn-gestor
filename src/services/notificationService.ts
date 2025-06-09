
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { createSmartNotificationMessage } from "@/utils/notificationUtils";

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

    console.warn("Criando notificação:", notification);

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

export const createSmartVehicleNotification = async (
  vehicleId: string,
  vehiclePlate: string,
  vehicleModel: string,
  changedFields: string[]
) => {
  const { message, details } = createSmartNotificationMessage(vehicleModel, vehiclePlate, changedFields);
  return createVehicleNotification(vehicleId, vehiclePlate, message, details);
};

export const markNotificationAsRead = async (notificationId: string, userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    // Primeiro verificar se já existe um registro
    const { data: existing } = await supabase
      .from('notification_read_status')
      .select('id')
      .eq('notification_id', notificationId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Se existe, fazer update
      const { error } = await supabase
        .from('notification_read_status')
        .update({
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('notification_id', notificationId)
        .eq('user_id', userId);
        
      if (error) {
        console.error('Erro ao marcar notificação como lida:', error);
        toast.error('Erro ao atualizar notificação');
        throw error;
      }
    } else {
      // Se não existe, fazer insert
      const { error } = await supabase
        .from('notification_read_status')
        .insert({
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
    }

    toast.success('Notificação marcada como lida');
    return true;
  } catch (error) {
    console.error("Erro ao marcar notificação como lida:", error);
    throw error;
  }
};

export const hideNotification = async (notificationId: string, userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    // Primeiro verificar se já existe um registro
    const { data: existing } = await supabase
      .from('notification_read_status')
      .select('id')
      .eq('notification_id', notificationId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Se existe, fazer update
      const { error } = await supabase
        .from('notification_read_status')
        .update({
          is_hidden: true,
          read_at: new Date().toISOString()
        })
        .eq('notification_id', notificationId)
        .eq('user_id', userId);
        
      if (error) {
        console.error('Erro ao ocultar notificação:', error);
        toast.error('Erro ao ocultar notificação');
        throw error;
      }
    } else {
      // Se não existe, fazer insert
      const { error } = await supabase
        .from('notification_read_status')
        .insert({
          notification_id: notificationId,
          user_id: userId,
          is_hidden: true,
          read_at: new Date().toISOString()
        });
        
      if (error) {
        console.error('Erro ao ocultar notificação:', error);
        toast.error('Erro ao ocultar notificação');
        throw error;
      }
    }

    toast.success('Notificação removida');
    return true;
  } catch (error) {
    console.error("Erro ao ocultar notificação:", error);
    throw error;
  }
};

export const restoreNotification = async (notificationId: string, userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    // Primeiro verificar se já existe um registro
    const { data: existing } = await supabase
      .from('notification_read_status')
      .select('id')
      .eq('notification_id', notificationId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Se existe, fazer update
      const { error } = await supabase
        .from('notification_read_status')
        .update({
          is_hidden: false
        })
        .eq('notification_id', notificationId)
        .eq('user_id', userId);
        
      if (error) {
        console.error('Erro ao restaurar notificação:', error);
        toast.error('Erro ao restaurar notificação');
        throw error;
      }
    } else {
      // Se não existe, fazer insert
      const { error } = await supabase
        .from('notification_read_status')
        .insert({
          notification_id: notificationId,
          user_id: userId,
          is_hidden: false
        });
        
      if (error) {
        console.error('Erro ao restaurar notificação:', error);
        toast.error('Erro ao restaurar notificação');
        throw error;
      }
    }

    toast.success('Notificação restaurada');
    return true;
  } catch (error) {
    console.error("Erro ao restaurar notificação:", error);
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
      .eq('is_read', false)
      .eq('is_hidden', false);
    
    if (fetchError) {
      console.error('Erro ao buscar notificações:', fetchError);
      toast.error('Erro ao buscar notificações');
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      return true;
    }

    // Para cada notificação, verificar se já existe registro e fazer update/insert apropriado
    const updatePromises = notifications.map(async (notification) => {
      const { data: existing } = await supabase
        .from('notification_read_status')
        .select('id')
        .eq('notification_id', notification.id)
        .eq('user_id', userId)
        .single();

      if (existing) {
        // Se existe, fazer update
        return supabase
          .from('notification_read_status')
          .update({
            is_read: true,
            read_at: new Date().toISOString()
          })
          .eq('notification_id', notification.id)
          .eq('user_id', userId);
      } else {
        // Se não existe, fazer insert
        return supabase
          .from('notification_read_status')
          .insert({
            notification_id: notification.id,
            user_id: userId,
            is_read: true,
            read_at: new Date().toISOString()
          });
      }
    });

    await Promise.all(updatePromises);
    return true;
  } catch (error) {
    console.error("Erro ao marcar notificações como lidas:", error);
    throw error;
  }
};
