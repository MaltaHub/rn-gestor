
import { useEffect } from 'react';
import { useVehiclePendencies } from './useVehiclePendencies';
import { useAdvertisements } from './useAdvertisements';
import { useRealTaskManager } from './useRealTaskManager';

export const useTaskAutomation = () => {
  const { pendencies } = useVehiclePendencies();
  const { advertisements } = useAdvertisements();
  const { createTask } = useRealTaskManager();

  // Automatizar criação de tarefas baseadas em pendências
  useEffect(() => {
    const createTasksFromPendencies = async () => {
      for (const pendency of pendencies) {
        let taskTitle = '';
        let taskDescription = '';
        let category: 'photos' | 'advertisements' | 'documentation' | 'maintenance' | 'system' = 'system';
        let priority: 'baixa' | 'normal' | 'alta' = 'normal';

        switch (pendency.type) {
          case 'missing_photos':
            taskTitle = `Adicionar fotos - ${pendency.plate}`;
            taskDescription = `Veículo ${pendency.plate} precisa de fotos para a loja ${pendency.store}`;
            category = 'photos';
            priority = pendency.severity === 'critical' ? 'alta' : 'normal';
            break;

          case 'missing_ads':
            taskTitle = `Criar anúncios - ${pendency.plate}`;
            taskDescription = `Criar anúncios nas plataformas: ${pendency.missingPlatforms?.join(', ')}`;
            category = 'advertisements';
            priority = pendency.severity === 'critical' ? 'alta' : 'normal';
            break;

          case 'incomplete_info':
            taskTitle = `Completar informações - ${pendency.plate}`;
            taskDescription = `Adicionar descrição detalhada para o veículo ${pendency.plate}`;
            category = 'documentation';
            priority = 'normal';
            break;

          case 'document_pending':
            taskTitle = `Acompanhar documentação - ${pendency.plate}`;
            taskDescription = pendency.description;
            category = 'documentation';
            priority = pendency.severity === 'critical' ? 'alta' : 'normal';
            break;
        }

        if (taskTitle) {
          createTask.mutate({
            title: taskTitle,
            description: taskDescription,
            vehicleId: pendency.vehicleId,
            category,
            priority,
            sourcePendencyId: pendency.id
          });
        }
      }
    };

    if (pendencies.length > 0) {
      createTasksFromPendencies();
    }
  }, [pendencies, createTask]);

  // Automatizar criação de tarefas para anúncios não publicados
  useEffect(() => {
    const createPublicationTasks = async () => {
      const unpublishedAds = advertisements.filter(ad => !ad.publicado);
      
      for (const ad of unpublishedAds) {
        createTask.mutate({
          title: `Publicar anúncio na ${ad.platform}`,
          description: `Anúncio para as placas: ${ad.vehicle_plates.join(', ')}. Revisar e publicar na ${ad.platform}`,
          category: 'advertisements',
          priority: 'normal',
          sourcePendencyId: ad.id
        });
      }
    };

    if (advertisements.length > 0) {
      createPublicationTasks();
    }
  }, [advertisements, createTask]);

  return {
    isAutoCreating: createTask.isPending
  };
};
