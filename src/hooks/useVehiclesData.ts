import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { SupabaseVehicle, Vehicle } from "../types";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";

const mapSupabaseVehicle = (supabaseVehicle: SupabaseVehicle): Vehicle => {
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
    fotos_rn: supabaseVehicle.fotos_rn
  };
};

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
      console.log('Buscando veículos com indicadores para usuário:', user?.id, 'loja:', currentStore);

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
  const vehicles: Vehicle[] = supabaseVehicles.map(mapSupabaseVehicle);

  return {
    vehicles,
    isLoadingVehicles,
    refetchVehicles
  };
};