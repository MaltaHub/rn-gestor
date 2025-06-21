
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { toast } from '@/components/ui/sonner';

interface CreateTaskParams {
  title: string;
  description: string;
  vehicleId?: string;
  category?: 'photos' | 'advertisements' | 'documentation' | 'maintenance' | 'system';
  priority?: 'baixa' | 'normal' | 'alta';
  sourcePendencyId?: string;
}

export const useRealTaskManager = () => {
  const { currentStore } = useStore();
  const queryClient = useQueryClient();

  const createTask = useMutation({
    mutationFn: async (params: CreateTaskParams) => {
      console.log('Creating task manually:', params);
      
      const { data, error } = await supabase.rpc('create_automatic_task', {
        p_title: params.title,
        p_description: params.description,
        p_vehicle_id: params.vehicleId,
        p_category: params.category || 'system',
        p_priority: params.priority || 'normal',
        p_store: currentStore,
        p_source_pendency_id: params.sourcePendencyId
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      toast.success('Tarefa criada com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao criar tarefa:', error);
      toast.error('Erro ao criar tarefa');
    }
  });

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      console.log('Completing task:', taskId);
      
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      toast.success('Tarefa concluída!');
    }
  });

  const syncTasks = useMutation({
    mutationFn: async () => {
      console.log('Syncing tasks with current state...');
      
      const { error } = await supabase.rpc('sync_tasks_with_current_state');
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      console.log('Tasks synchronized successfully');
    }
  });

  const resolvePendency = useMutation({
    mutationFn: async ({ 
      type, 
      identifier, 
      method = 'manual', 
      notes 
    }: {
      type: string;
      identifier: string;
      method?: string;
      notes?: string;
    }) => {
      console.log('Resolving pendency:', { type, identifier, method });
      
      const { data, error } = await supabase.rpc('resolve_pendency', {
        p_pendency_type: type,
        p_pendency_identifier: identifier,
        p_resolution_method: method,
        p_notes: notes
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-insights'] });
      queryClient.invalidateQueries({ queryKey: ['productivity-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      toast.success('Pendência resolvida!');
    }
  });

  // Nova função para recalcular todo o sistema
  const recalculateSystem = useMutation({
    mutationFn: async () => {
      console.log('Triggering full system recalculation...');
      
      const { error } = await supabase.rpc('recalculate_all_pendencies');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      toast.success('Sistema recalculado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao recalcular sistema:', error);
      toast.error('Erro ao recalcular sistema');
    }
  });

  return {
    createTask,
    completeTask,
    resolvePendency,
    syncTasks,
    recalculateSystem,
    isCreating: createTask.isPending,
    isCompleting: completeTask.isPending,
    isResolving: resolvePendency.isPending,
    isSyncing: syncTasks.isPending,
    isRecalculating: recalculateSystem.isPending
  };
};
