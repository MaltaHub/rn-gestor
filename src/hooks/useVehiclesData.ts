
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Vehicle, SupabaseVehicle } from "../types";
import { mapSupabaseVehicleToVehicle } from "@/utils/vehicleMappers";
import { useAuth } from "@/contexts/AuthContext";

export const useVehiclesData = () => {
  const { user } = useAuth();

  // Fetch vehicles data
  const {
    data: supabaseVehicles = [],
    isLoading: isLoadingVehicles,
    refetch: refetchVehicles
  } = useQuery({
    queryKey: ['vehicles', user?.id],
    queryFn: async () => {
      if (!user) {
        console.log('Usuário não autenticado - não buscando veículos');
        return [];
      }

      console.log('Buscando veículos para usuário:', user.id);
      const { data, error } = await supabase
        .from('vehicles')
        .select('*');
      
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
