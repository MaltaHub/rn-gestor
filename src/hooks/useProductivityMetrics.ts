
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProductivityMetrics {
  id: string;
  user_id: string;
  date: string;
  tasks_completed: number;
  pendencies_resolved: number;
  total_time_spent: string;
  efficiency_score: number | null;
}

export const useProductivityMetrics = (dateRange: number = 7) => {
  return useQuery({
    queryKey: ['productivity-metrics', dateRange],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);
      
      const { data, error } = await supabase
        .from('productivity_metrics')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data as ProductivityMetrics[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
};
