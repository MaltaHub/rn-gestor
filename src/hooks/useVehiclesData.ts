import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { VehicleWithIndicators, SupabaseVehicleWithIndicators } from "../types";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";

const mapSupabaseVehicleToVehicle = (supabaseVehicle: SupabaseVehicleWithIndicators): VehicleWithIndicators => {
  return {
    id: supabaseVehicle.id,
    plate: supabaseVehicle.plate,
    model: supabaseVehicle.model,
    color: supabaseVehicle.color,
    mileage: supabaseVehicle.mileage,
    image_url: supabaseVehicle.image_url,
    price: supabaseVehicle.price,
    year: supabaseVehicle.year,
    description: supabaseVehicle.description,
    specifications: supabaseVehicle.specifications,
    status: supabaseVehicle.status,
    added_at: supabaseVehicle.added_at,
    user_id: supabaseVehicle.user_id,
    store: supabaseVehicle.store,
    local: supabaseVehicle.local,
    documentacao: supabaseVehicle.documentacao,
    fotos_roberto: supabaseVehicle.fotos_roberto,
    fotos_rn: supabaseVehicle.fotos_rn,
    indicador_amarelo: supabaseVehicle.indicador_amarelo,
    indicador_vermelho: supabaseVehicle.indicador_vermelho,
    indicador_lilas: supabaseVehicle.indicador_lilas,
    anuncios: supabaseVehicle.anuncios ? JSON.parse(JSON.stringify(supabaseVehicle.anuncios)) : undefined
  };
};

export const useVehiclesData = () => {
  const { user } = useAuth();
  const { currentStore } = useStore();

  // Fetch vehicles data with indicators
  const {
    data: supabaseVehicles = [],
    isLoading: isLoadingVehicles,
    refetch: refetchVehicles
  } = useQuery({
    queryKey: ['vehicles-with-indicators', user?.id, currentStore],
    queryFn: async () => {
      console.log('Buscando veículos com indicadores para usuário:', user?.id, 'loja:', currentStore);
      
      if (!user) {
        console.log('Usuário não autenticado - retornando array vazio');
        return [];
      }

      const { data, error } = await supabase
        .from('vehicles_with_indicators')
        .select('*')
        .eq('store', currentStore);
      
      if (error) {
        console.error('Erro ao buscar veículos:', error);
        toast.error('Erro ao buscar veículos');
        return [];
      }
      
      console.log('Veículos encontrados:', data?.length || 0);
      return data as SupabaseVehicleWithIndicators[];
    },
    enabled: !!user,
    retry: 1
  });

  // Map to application format
  const vehicles: VehicleWithIndicators[] = supabaseVehicles.map(mapSupabaseVehicleToVehicle);

  return {
    vehicles,
    isLoadingVehicles,
    refetchVehicles
  };
};
