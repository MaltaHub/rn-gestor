
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useConsolidatedTasks } from './useConsolidatedTasks';

export const usePendingCache = () => {
  const { currentStore } = useStore();
  const { data: consolidatedTasks = [] } = useConsolidatedTasks();

  const { data = { tasks: [], insights: [] }, isLoading, refetch } = useQuery({
    queryKey: ['pending-cache', currentStore],
    queryFn: async () => {
      console.log('Fetching pending cache for store:', currentStore);

      // Buscar insights não resolvidos
      const { data: insights, error: insightsError } = await supabase
        .from('advertisement_insights')
        .select('*')
        .eq('store', currentStore)
        .eq('resolved', false)
        .order('created_at', { ascending: false });

      if (insightsError) {
        console.error('Error fetching insights:', insightsError);
        throw insightsError;
      }

      // Usar tarefas consolidadas do novo hook
      const pendingTasks = consolidatedTasks
        .filter(task => task.status === 'pending')
        .map(task => ({
          id: task.task_id,
          title: task.title,
          description: task.description,
          prioridade: task.priority,
          store: task.store,
          created_at: task.created_at,
          vehicle_id: task.vehicle_id,
          vehicles: task.vehicle_plate ? { plate: task.vehicle_plate } : null
        }));

      console.log('Pending cache loaded:', {
        tasks: pendingTasks.length,
        insights: insights?.length || 0
      });

      return {
        tasks: pendingTasks,
        insights: insights || []
      };
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const forceRefresh = () => {
    console.log('Force refreshing pending cache');
    refetch();
  };

  return {
    data,
    isLoading,
    forceRefresh
  };
};
