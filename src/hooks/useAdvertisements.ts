
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Advertisement, SupabaseAdvertisement, StoreType, PlatformType } from "@/types/store";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";

export const useAdvertisements = () => {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const queryClient = useQueryClient();

  // Fetch advertisements
  const {
    data: advertisements = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['advertisements', currentStore],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('advertisements')
        .select('*')
        .eq('store', currentStore)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar anúncios:', error);
        toast.error('Erro ao buscar anúncios');
        return [];
      }
      
      return data as SupabaseAdvertisement[];
    },
    enabled: !!user
  });

  // Create advertisement mutation
  const createAdvertisementMutation = useMutation({
    mutationFn: async (newAd: Omit<Advertisement, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('advertisements')
        .insert({
          ...newAd,
          store: currentStore
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      refetch();
      toast.success('Anúncio criado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao criar anúncio:', error);
      toast.error('Erro ao criar anúncio');
    }
  });

  // Update advertisement mutation
  const updateAdvertisementMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Advertisement> }) => {
      const { error } = await supabase
        .from('advertisements')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
      toast.success('Anúncio atualizado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao atualizar anúncio:', error);
      toast.error('Erro ao atualizar anúncio');
    }
  });

  // Delete advertisement mutation
  const deleteAdvertisementMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('advertisements')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
      toast.success('Anúncio removido com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao remover anúncio:', error);
      toast.error('Erro ao remover anúncio');
    }
  });

  return {
    advertisements: advertisements.map(ad => ({
      ...ad,
      vehicle_plates: ad.vehicle_plates || []
    })) as Advertisement[],
    isLoading,
    createAdvertisement: createAdvertisementMutation.mutate,
    updateAdvertisement: updateAdvertisementMutation.mutate,
    deleteAdvertisement: deleteAdvertisementMutation.mutate,
    refetch
  };
};

export const useAdvertisementsByVehicle = (vehicleId: string) => {
  const { currentStore } = useStore();

  return useQuery({
    queryKey: ['advertisements-by-vehicle', vehicleId, currentStore],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('advertisements')
        .select('*')
        .eq('store', currentStore)
        .contains('vehicle_plates', [vehicleId]);
      
      if (error) {
        console.error('Erro ao buscar anúncios do veículo:', error);
        return [];
      }
      
      return data as SupabaseAdvertisement[];
    },
    enabled: !!vehicleId
  });
};
