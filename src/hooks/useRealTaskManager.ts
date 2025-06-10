
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
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      toast.success('Tarefa criada com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao criar tarefa:', error);
      toast.error('Erro ao criar tarefa');
    }
  });

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
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
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      toast.success('Tarefa concluída!');
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
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-insights'] });
      queryClient.invalidateQueries({ queryKey: ['productivity-metrics'] });
      toast.success('Pendência resolvida!');
    }
  });

  return {
    createTask,
    completeTask,
    resolvePendency,
    isCreating: createTask.isPending,
    isCompleting: completeTask.isPending,
    isResolving: resolvePendency.isPending
  };
};
