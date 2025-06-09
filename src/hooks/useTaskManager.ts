
import { useMemo } from 'react';
import { usePendingCache } from './usePendingCache';
import { useAdvertisements } from './useAdvertisements';
import { useVehiclesData } from './useVehiclesData';
import { usePendingWorkflow } from './usePendingWorkflow';

export interface TaskManager {
  hasDuplicateTask: (title: string, vehicleId?: string) => boolean;
  canCreatePublicationTask: (advertisementId: string) => boolean;
  getObsoleteTasks: () => any[];
  createSmartTask: (taskData: {
    title: string;
    description: string;
    vehicleId?: string;
    advertisementId?: string;
    priority?: string;
    type?: string;
  }) => Promise<void>;
  cleanupObsoleteTasks: () => Promise<void>;
  getTasksForAdvertisement: (advertisementId: string) => any[];
}

export const useTaskManager = (): TaskManager => {
  const { data: pendingData, refetch } = usePendingCache();
  const { advertisements } = useAdvertisements();
  const { vehicles } = useVehiclesData();
  const { markTaskCompleted } = usePendingWorkflow();

  const manager = useMemo<TaskManager>(() => {
    const hasDuplicateTask = (title: string, vehicleId?: string): boolean => {
      return pendingData.tasks.some(task => 
        task.title === title && 
        (!vehicleId || task.vehicle_id === vehicleId) &&
        !task.completed
      );
    };

    const canCreatePublicationTask = (advertisementId: string): boolean => {
      const ad = advertisements.find(a => a.id === advertisementId);
      if (!ad || ad.publicado) return false;

      // Verificar se já existe tarefa para este anúncio
      return !pendingData.tasks.some(task =>
        task.related_field === 'advertisement_id' &&
        task.field_value === advertisementId &&
        !task.completed
      );
    };

    const getObsoleteTasks = () => {
      const obsoleteTasks = [];

      // Tarefas de publicação para anúncios já publicados
      const publishedAds = advertisements.filter(ad => ad.publicado);
      publishedAds.forEach(ad => {
        const relatedTasks = pendingData.tasks.filter(task =>
          task.related_field === 'advertisement_id' &&
          task.field_value === ad.id &&
          !task.completed
        );
        obsoleteTasks.push(...relatedTasks);
      });

      // Tarefas para veículos que foram vendidos ou removidos
      const soldVehicles = vehicles.filter(v => v.status === 'sold');
      soldVehicles.forEach(vehicle => {
        const relatedTasks = pendingData.tasks.filter(task =>
          task.vehicle_id === vehicle.id &&
          !task.completed
        );
        obsoleteTasks.push(...relatedTasks);
      });

      return obsoleteTasks;
    };

    const createSmartTask = async (taskData: {
      title: string;
      description: string;
      vehicleId?: string;
      advertisementId?: string;
      priority?: string;
      type?: string;
    }) => {
      // Verificar se não é uma tarefa duplicada
      if (hasDuplicateTask(taskData.title, taskData.vehicleId)) {
        console.log('Tarefa duplicada detectada, não criando:', taskData.title);
        return;
      }

      // Se é tarefa de publicação, verificar se o anúncio ainda precisa ser publicado
      if (taskData.advertisementId && !canCreatePublicationTask(taskData.advertisementId)) {
        console.log('Anúncio já publicado ou tarefa já existe:', taskData.advertisementId);
        return;
      }

      // Criar a tarefa (simulando - na implementação real seria via API)
      console.log('Criando tarefa inteligente:', taskData);
      
      // Após criar, atualizar o cache
      await refetch();
    };

    const cleanupObsoleteTasks = async () => {
      const obsoleteTasks = getObsoleteTasks();
      
      for (const task of obsoleteTasks) {
        try {
          await markTaskCompleted(task.id);
          console.log('Tarefa obsoleta removida:', task.title);
        } catch (error) {
          console.error('Erro ao remover tarefa obsoleta:', error);
        }
      }

      if (obsoleteTasks.length > 0) {
        await refetch();
      }
    };

    const getTasksForAdvertisement = (advertisementId: string) => {
      return pendingData.tasks.filter(task =>
        task.related_field === 'advertisement_id' &&
        task.field_value === advertisementId &&
        !task.completed
      );
    };

    return {
      hasDuplicateTask,
      canCreatePublicationTask,
      getObsoleteTasks,
      createSmartTask,
      cleanupObsoleteTasks,
      getTasksForAdvertisement
    };
  }, [pendingData, advertisements, vehicles, markTaskCompleted, refetch]);

  return manager;
};
