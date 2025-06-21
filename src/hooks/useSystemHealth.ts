
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { toast } from '@/components/ui/sonner';

export interface SystemHealthMetrics {
  totalInconsistencies: number;
  orphanedAds: number;
  vehiclesWithoutAds: number;
  priceInconsistencies: number;
  lastHealthCheck: string;
  healthScore: number;
}

export const useSystemHealth = () => {
  const { currentStore } = useStore();
  const queryClient = useQueryClient();

  const { data: healthMetrics, isLoading } = useQuery({
    queryKey: ['system-health', currentStore],
    queryFn: async (): Promise<SystemHealthMetrics> => {
      console.log('Checking system health for store:', currentStore);

      // Buscar tarefas de inconsistência usando a estrutura atualizada da tabela
      const { data: inconsistencyTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('ref_table', 'vehicles')
        .eq('status', 'pending')
        .ilike('description', '%Inconsistência%');

      if (tasksError) throw tasksError;

      // Buscar anúncios órfãos usando title e description
      const { data: orphanedAds, error: orphanedError } = await supabase
        .from('tasks')
        .select('*')
        .eq('ref_table', 'vehicles')
        .eq('status', 'pending')
        .or('title.ilike.%órfão%,description.ilike.%órfão%');

      if (orphanedError) throw orphanedError;

      // Buscar veículos sem anúncios usando title e description
      const { data: missingAds, error: missingError } = await supabase
        .from('tasks')
        .select('*')
        .eq('ref_table', 'vehicles')
        .eq('status', 'pending')
        .or('title.ilike.%Criar anúncios%,description.ilike.%Criar anúncios%');

      if (missingError) throw missingError;

      // Buscar inconsistências de preço usando title e description
      const { data: priceIssues, error: priceError } = await supabase
        .from('tasks')
        .select('*')
        .eq('ref_table', 'vehicles')
        .eq('status', 'pending')
        .or('title.ilike.%preço%,description.ilike.%preço%');

      if (priceError) throw priceError;

      const totalInconsistencies = (inconsistencyTasks?.length || 0) + 
                                  (orphanedAds?.length || 0) + 
                                  (missingAds?.length || 0) + 
                                  (priceIssues?.length || 0);

      // Calcular score de saúde (0-100)
      const healthScore = Math.max(0, 100 - (totalInconsistencies * 5));

      return {
        totalInconsistencies,
        orphanedAds: orphanedAds?.length || 0,
        vehiclesWithoutAds: missingAds?.length || 0,
        priceInconsistencies: priceIssues?.length || 0,
        lastHealthCheck: new Date().toISOString(),
        healthScore
      };
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000
  });

  const recalculatePendencies = useMutation({
    mutationFn: async () => {
      console.log('Triggering full system recalculation...');
      
      const { error } = await supabase.rpc('recalculate_all_pendencies');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      toast.success('Sistema recalculado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao recalcular sistema:', error);
      toast.error('Erro ao recalcular sistema');
    }
  });

  const detectInconsistencies = useMutation({
    mutationFn: async () => {
      console.log('Detecting advertisement inconsistencies...');
      
      const { error } = await supabase.rpc('detect_advertisement_inconsistencies');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      toast.success('Inconsistências detectadas e tarefas criadas!');
    },
    onError: (error) => {
      console.error('Erro ao detectar inconsistências:', error);
      toast.error('Erro ao detectar inconsistências');
    }
  });

  return {
    healthMetrics,
    isLoading,
    recalculatePendencies,
    detectInconsistencies,
    isRecalculating: recalculatePendencies.isPending,
    isDetecting: detectInconsistencies.isPending
  };
};
