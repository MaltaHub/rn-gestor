
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Vehicle, SupabaseVehicle } from "../types";
import { mapSupabaseVehicleToVehicle } from "@/utils/vehicleMappers";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";

export const useVehiclesData = () => {
  const { user } = useAuth();
  const { currentStore } = useStore();

  // Fetch vehicles data
  const {
    data: supabaseVehicles = [],
    isLoading: isLoadingVehicles,
    refetch: refetchVehicles
  } = useQuery({
    queryKey: ['vehicles', user?.id, currentStore],
    queryFn: async () => {
      console.log('Buscando veículos para usuário:', user?.id, 'loja:', currentStore);
      
      if (!user) {
        console.log('Usuário não autenticado - retornando array vazio');
        return [];
      }

      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('store', currentStore);
      
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
