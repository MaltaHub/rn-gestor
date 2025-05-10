
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export const createVehicleNotification = async (
  vehicleId: string,
  vehiclePlate: string,
  message: string,
  details: string,
  userId: string
) => {
  if (!userId) {
    console.error("Usuário não autenticado");
    return null;
  }

  try {
    const notification = {
      vehicle_id: vehicleId,
      vehicle_plate: vehiclePlate,
      message,
      details,
      is_read: false,
      user_id: userId
    };

    const { data, error } = await supabase.from('notifications').insert(notification);
    
    if (error) {
      console.error('Erro ao criar notificação:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error("Erro ao criar notificação:", error);
    return null;
  }
};

export const markAllNotificationsAsRead = async (userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    
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
