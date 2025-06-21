
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';

interface TaskSystemStats {
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  systemHealth: number;
}

export const useTaskSystem = () => {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Buscar estatísticas consolidadas do sistema de tarefas
  const { data: taskStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['task-system-stats', currentStore],
    queryFn: async (): Promise<TaskSystemStats> => {
      console.log('Fetching task system stats for store:', currentStore);
      
      // Buscar tarefas consolidadas
      const { data: tasks, error } = await supabase.rpc('get_consolidated_task_state');
      
      if (error) {
        console.error('Error fetching consolidated tasks:', error);
        throw error;
      }

      const storeTasks = tasks?.filter(t => t.store === currentStore) || [];
      const pendingTasks = storeTasks.filter(t => t.status === 'pending').length;
      const completedTasks = storeTasks.filter(t => t.status === 'completed').length;
      const totalTasks = storeTasks.length;
      
      // Calcular saúde do sistema (0-100)
      const systemHealth = totalTasks > 0 ? Math.max(0, 100 - (pendingTasks * 10)) : 100;

      return {
        totalTasks,
        pendingTasks,
        completedTasks,
        systemHealth
      };
    },
    staleTime: 30 * 1000, // 30 segundos
    refetchInterval: 60 * 1000, // Refetch a cada minuto
  });

  // Recalcular todo o sistema
  const recalculateSystem = useMutation({
    mutationFn: async () => {
      console.log('Triggering full system recalculation...');
      
      const { error } = await supabase.rpc('recalculate_all_pendencies');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-system-stats'] });
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      toast.success('Sistema recalculado com sucesso!');
    },
    onError: (error) => {
      console.error('Error recalculating system:', error);
      toast.error('Erro ao recalcular sistema');
    }
  });

  // Detectar inconsistências
  const detectInconsistencies = useMutation({
    mutationFn: async () => {
      console.log('Detecting advertisement inconsistencies...');
      
      const { error } = await supabase.rpc('detect_advertisement_inconsistencies');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-system-stats'] });
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      toast.success('Inconsistências detectadas e tarefas criadas!');
    },
    onError: (error) => {
      console.error('Error detecting inconsistencies:', error);
      toast.error('Erro ao detectar inconsistências');
    }
  });

  // Limpar tarefas obsoletas
  const cleanupObsoleteTasks = useMutation({
    mutationFn: async () => {
      console.log('Cleaning up obsolete tasks...');
      
      const { error } = await supabase.rpc('cleanup_obsolete_tasks');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-system-stats'] });
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      toast.success('Tarefas obsoletas removidas!');
    },
    onError: (error) => {
      console.error('Error cleaning up tasks:', error);
      toast.error('Erro ao limpar tarefas obsoletas');
    }
  });

  // Sincronizar estado atual
  const syncCurrentState = useMutation({
    mutationFn: async () => {
      console.log('Syncing tasks with current state...');
      
      const { error } = await supabase.rpc('sync_tasks_with_current_state');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-system-stats'] });
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      toast.success('Estado sincronizado!');
    },
    onError: (error) => {
      console.error('Error syncing state:', error);
      toast.error('Erro ao sincronizar estado');
    }
  });

  return {
    taskStats,
    isLoadingStats,
    recalculateSystem,
    detectInconsistencies,
    cleanupObsoleteTasks,
    syncCurrentState,
    isRecalculating: recalculateSystem.isPending,
    isDetecting: detectInconsistencies.isPending,
    isCleaning: cleanupObsoleteTasks.isPending,
    isSyncing: syncCurrentState.isPending
  };
};
