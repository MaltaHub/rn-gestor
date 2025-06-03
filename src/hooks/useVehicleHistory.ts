
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { VehicleHistory, SupabaseVehicleHistory } from "../types";
import { useAuth } from "@/contexts/AuthContext";

export const useVehicleHistory = (vehicleId?: string) => {
  const { user } = useAuth();

  const {
    data: history = [],
    isLoading: isLoadingHistory,
    refetch: refetchHistory
  } = useQuery({
    queryKey: ['vehicle-history', vehicleId, user?.id],
    queryFn: async () => {
      if (!user || !vehicleId) {
        console.log('Usuário não autenticado ou veículo não especificado');
        return [];
      }

      console.log('Buscando histórico para veículo:', vehicleId);
      const { data, error } = await supabase
        .from('vehicle_history_with_user')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('changed_at', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar histórico:', error);
        toast.error('Erro ao buscar histórico do veículo');
        return [];
      }
      
      console.log('Histórico encontrado:', data?.length || 0);
      return data.map((item: SupabaseVehicleHistory): VehicleHistory => ({
        id: item.id,
        vehicle_id: item.vehicle_id,
        changed_by: item.changed_by,
        changed_at: item.changed_at,
        field_name: item.field_name,
        old_value: item.old_value,
        new_value: item.new_value,
        user_name: item.name
      }));
    },
    enabled: !!user && !!vehicleId,
    retry: 1
  });

  return {
    history,
    isLoadingHistory,
    refetchHistory
  };
};
