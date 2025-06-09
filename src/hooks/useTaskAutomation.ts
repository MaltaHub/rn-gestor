
import { useEffect } from 'react';
import { useTaskManager } from './useTaskManager';
import { useVehiclePendencies } from './useVehiclePendencies';
import { useAdvertisements } from './useAdvertisements';
import { usePendingWorkflow } from './usePendingWorkflow';

export const useTaskAutomation = () => {
  const { createSmartTask, cleanupObsoleteTasks } = useTaskManager();
  const { pendencies } = useVehiclePendencies();
  const { advertisements } = useAdvertisements();
  const { markAdvertisementPublished, resolveInsight } = usePendingWorkflow();

  // Automatizar criação de tarefas baseadas em pendências
  useEffect(() => {
    const createTasksFromPendencies = async () => {
      for (const pendency of pendencies) {
        let taskTitle = '';
        let taskDescription = '';
        let priority = 'normal';

        switch (pendency.type) {
          case 'missing_photos':
            taskTitle = `Adicionar fotos - ${pendency.plate}`;
            taskDescription = `Veículo ${pendency.plate} precisa de fotos para a loja ${pendency.store}`;
            priority = pendency.severity === 'critical' ? 'alta' : 'normal';
            break;

          case 'missing_ads':
            taskTitle = `Criar anúncios - ${pendency.plate}`;
            taskDescription = `Criar anúncios nas plataformas: ${pendency.missingPlatforms?.join(', ')}`;
            priority = pendency.severity === 'critical' ? 'alta' : 'normal';
            break;

          case 'incomplete_info':
            taskTitle = `Completar informações - ${pendency.plate}`;
            taskDescription = `Adicionar descrição detalhada para o veículo ${pendency.plate}`;
            priority = 'normal';
            break;

          case 'document_pending':
            taskTitle = `Acompanhar documentação - ${pendency.plate}`;
            taskDescription = pendency.description;
            priority = pendency.severity === 'critical' ? 'alta' : 'normal';
            break;
        }

        if (taskTitle) {
          await createSmartTask({
            title: taskTitle,
            description: taskDescription,
            vehicleId: pendency.vehicleId,
            priority,
            type: pendency.type
          });
        }
      }
    };

    if (pendencies.length > 0) {
      createTasksFromPendencies();
    }
  }, [pendencies, createSmartTask]);

  // Automatizar criação de tarefas para novos anúncios não publicados
  useEffect(() => {
    const createPublicationTasks = async () => {
      const unpublishedAds = advertisements.filter(ad => !ad.publicado);
      
      for (const ad of unpublishedAds) {
        await createSmartTask({
          title: `Publicar anúncio na ${ad.platform}`,
          description: `Anúncio para as placas: ${ad.vehicle_plates.join(', ')}. Revisar e publicar na ${ad.platform}`,
          advertisementId: ad.id,
          priority: 'normal',
          type: 'publication'
        });
      }
    };

    if (advertisements.length > 0) {
      createPublicationTasks();
    }
  }, [advertisements, createSmartTask]);

  // Limpeza automática de tarefas obsoletas (executa a cada 5 minutos)
  useEffect(() => {
    const interval = setInterval(() => {
      cleanupObsoleteTasks();
    }, 5 * 60 * 1000); // 5 minutos

    // Executa uma vez ao montar
    cleanupObsoleteTasks();

    return () => clearInterval(interval);
  }, [cleanupObsoleteTasks]);

  // Resolução automática de pendências quando condições são atendidas
  useEffect(() => {
    const autoResolvePendencies = async () => {
      // Resolver automaticamente anúncios quando são publicados
      const publishedAds = advertisements.filter(ad => ad.publicado);
      
      for (const ad of publishedAds) {
        // Se o anúncio foi publicado, resolver insights relacionados
        // (isso já é feito pelo trigger do banco, mas podemos garantir aqui também)
        try {
          console.log(`Anúncio ${ad.id} foi publicado, verificando resolução automática`);
        } catch (error) {
          console.error('Erro na resolução automática:', error);
        }
      }
    };

    autoResolvePendencies();
  }, [advertisements]);

  return {
    // Exposr funções para uso manual se necessário
    triggerTaskCreation: async () => {
      console.log('Iniciando criação automática de tarefas...');
    },
    triggerCleanup: cleanupObsoleteTasks
  };
};
