import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { toast } from '@/components/ui/sonner';
import { updateVehicleWithPendencyRecalc, triggerSystemRecalculation } from '@/services/vehicleService';
import { useTaskManager } from './useTaskManager';

export const useEnhancedTaskManager = () => {
  const { currentStore } = useStore();
  const queryClient = useQueryClient();
  const taskManager = useTaskManager();

  const updateVehicleWithTasks = useMutation({
    mutationFn: async ({ 
      vehicleId, 
      updates, 
      userId 
    }: {
      vehicleId: string;
      updates: any;
      userId: string;
    }) => {
      console.log('Enhanced Task Manager - Updating vehicle with automatic task generation');
      return await updateVehicleWithPendencyRecalc(vehicleId, updates, userId);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
        queryClient.invalidateQueries({ queryKey: ['system-health'] });
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      console.error('Enhanced Task Manager - Vehicle update error:', error);
      toast.error('Erro ao atualizar veículo');
    }
  });

  const forceSystemRecalc = useMutation({
    mutationFn: async () => {
      console.log('Enhanced Task Manager - Forcing complete system recalculation');
      return await triggerSystemRecalculation();
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
        queryClient.invalidateQueries({ queryKey: ['system-health'] });
        queryClient.invalidateQueries({ queryKey: ['pending-insights'] });
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      console.error('Enhanced Task Manager - System recalc error:', error);
      toast.error('Erro ao recalcular sistema');
    }
  });

  const bulkUpdateAdvertisements = useMutation({
    mutationFn: async (advertisements: { id: string; updates: any }[]) => {
      console.log('Enhanced Task Manager - Bulk updating advertisements');
      
      const results = [];
      for (const ad of advertisements) {
        const { data, error } = await supabase
          .from('advertisements')
          .update(ad.updates)
          .eq('id', ad.id)
          .select()
          .single();
          
        if (error) throw error;
        results.push(data);
      }
      
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertisements'] });
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      toast.success('Anúncios atualizados com sucesso!');
    },
    onError: (error) => {
      console.error('Enhanced Task Manager - Bulk ad update error:', error);
      toast.error('Erro ao atualizar anúncios');
    }
  });

  const cleanupObsoleteTasks = useMutation({
    mutationFn: async () => {
      console.log('Enhanced Task Manager - Cleaning up obsolete tasks (client-side)');
      await taskManager.cleanupObsoleteTasks();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consolidated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      toast.success('Tarefas obsoletas removidas!');
    },
    onError: (error) => {
      console.error('Enhanced Task Manager - Cleanup error:', error);
      toast.error('Erro ao limpar tarefas obsoletas');
    }
  });

  return {
    updateVehicleWithTasks,
    forceSystemRecalc,
    bulkUpdateAdvertisements,
    cleanupObsoleteTasks,
    isUpdatingVehicle: updateVehicleWithTasks.isPending,
    isRecalculating: forceSystemRecalc.isPending,
    isUpdatingAds: bulkUpdateAdvertisements.isPending,
    isCleaning: cleanupObsoleteTasks.isPending
  };
};
