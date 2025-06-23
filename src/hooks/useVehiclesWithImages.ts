import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { VehicleWithIndicators, VehicleImage } from "../types";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";

interface VehicleWithImages extends VehicleWithIndicators {
  images: VehicleImage[];
  coverImage?: VehicleImage;
}

export const useVehiclesWithImages = () => {
  const { user } = useAuth();
  const { currentStore } = useStore();

  const {
    data: vehiclesWithImages = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['vehicles-with-images', user?.id, currentStore],
    queryFn: async () => {
      if (!user) {
        return [];
      }

      // Buscar veículos com indicadores
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles_with_indicators')
        .select('*')
        .eq('store', currentStore);
      
      if (vehiclesError) {
        console.error('Erro ao buscar veículos:', vehiclesError);
        toast.error('Erro ao buscar veículos');
        return [];
      }

      // Buscar todas as imagens dos veículos
      const { data: allImages, error: imagesError } = await supabase
        .from('vehicle_images')
        .select('*')
        .eq('store', currentStore)
        .order('display_order', { ascending: true });
      
      if (imagesError) {
        console.error('Erro ao buscar imagens:', imagesError);
        // Não mostrar erro para imagens, apenas log
      }

      // Mapear veículos com suas imagens
      const vehiclesWithImagesData: VehicleWithImages[] = vehicles.map((vehicle: any) => {
        const vehicleImages = allImages?.filter(img => img.vehicle_id === vehicle.id) || [];
        const coverImage = vehicleImages.find(img => img.is_cover);
        
        return {
          id: vehicle.id,
          plate: vehicle.plate,
          model: vehicle.model,
          color: vehicle.color,
          mileage: vehicle.mileage,
          image_url: vehicle.image_url,
          price: vehicle.price,
          year: vehicle.year,
          description: vehicle.description,
          specifications: vehicle.specifications,
          status: vehicle.status,
          added_at: vehicle.added_at,
          user_id: vehicle.user_id,
          store: vehicle.store,
          local: vehicle.local,
          documentacao: vehicle.documentacao,
          fotos_roberto: vehicle.fotos_roberto,
          fotos_rn: vehicle.fotos_rn,
          indicador_amarelo: vehicle.indicador_amarelo,
          indicador_vermelho: vehicle.indicador_vermelho,
          indicador_lilas: vehicle.indicador_lilas,
          anuncios: vehicle.anuncios ? JSON.parse(JSON.stringify(vehicle.anuncios)) : undefined,
          images: vehicleImages,
          coverImage: coverImage || vehicleImages[0] || null
        };
      });

      return vehiclesWithImagesData;
    },
    enabled: !!user,
    retry: 1
  });

  return {
    vehicles: vehiclesWithImages,
    isLoading,
    refetch
  };
}; 