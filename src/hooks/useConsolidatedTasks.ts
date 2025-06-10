
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ConsolidatedTask {
  task_id: string;
  title: string;
  description: string;
  vehicle_id: string | null;
  category: string;
  priority: string;
  store: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  source_type: string;
  source_id: string | null;
  vehicle_plate: string | null;
}

export const useConsolidatedTasks = () => {
  return useQuery({
    queryKey: ['consolidated-tasks'],
    queryFn: async () => {
      console.log('Fetching consolidated tasks state...');
      
      const { data, error } = await supabase.rpc('get_consolidated_task_state');
      
      if (error) {
        console.error('Error fetching consolidated tasks:', error);
        throw error;
      }
      
      console.log('Consolidated tasks fetched:', data?.length || 0, 'tasks');
      return data as ConsolidatedTask[];
    },
    staleTime: 30 * 1000, // 30 segundos
    refetchInterval: 60 * 1000, // Refetch a cada 1 minuto
  });
};
