
import { useMemo } from 'react';
import { useVehiclePendencies } from './useVehiclePendencies';
import { usePendingCache } from './usePendingCache';
import { useAdvertisements } from './useAdvertisements';
import { useConsolidatedTasks } from './useConsolidatedTasks';

export interface MenuAlert {
  count: number;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface MenuAlerts {
  inventory: MenuAlert | null;
  advertisements: MenuAlert | null;
  pendings: MenuAlert | null;
  sales: MenuAlert | null;
}

export const useMenuAlerts = () => {
  const { stats: pendencyStats } = useVehiclePendencies();
  const { data: pendingData } = usePendingCache();
  const { advertisements } = useAdvertisements();
  const { data: consolidatedTasks = [] } = useConsolidatedTasks();

  const alerts = useMemo<MenuAlerts>(() => {
    // Alerta para Estoque (baseado em pendências críticas)
    const inventoryAlert: MenuAlert | null = pendencyStats.critical > 0 ? {
      count: pendencyStats.critical,
      severity: 'critical',
      message: `${pendencyStats.critical} veículo(s) com problemas críticos`
    } : pendencyStats.total > 0 ? {
      count: pendencyStats.total,
      severity: 'warning',
      message: `${pendencyStats.total} pendência(s) no estoque`
    } : null;

    // Alerta para Anúncios (anúncios não publicados + tarefas de publicação)
    const unpublishedAds = advertisements.filter(ad => !ad.publicado).length;
    const publicationTasks = consolidatedTasks.filter(task => 
      task.category === 'advertisements' && 
      task.title?.includes('Publicar anúncio') && 
      task.status === 'pending'
    ).length;
    
    const totalAdAlerts = unpublishedAds + publicationTasks;
    const advertisementsAlert: MenuAlert | null = totalAdAlerts > 0 ? {
      count: totalAdAlerts,
      severity: unpublishedAds > 5 ? 'critical' : 'warning',
      message: `${unpublishedAds} anúncio(s) para publicar, ${publicationTasks} tarefa(s) pendente(s)`
    } : null;

    // Alerta para Pendentes (tarefas gerais não relacionadas a publicação)
    const generalTasks = consolidatedTasks.filter(task => 
      task.status === 'pending' && 
      (!task.title?.includes('Publicar anúncio') || task.category !== 'advertisements')
    ).length;
    
    const pendingInsights = pendingData.insights.filter(insight => !insight.resolved).length;
    const totalPendingAlerts = generalTasks + pendingInsights;
    
    const pendingsAlert: MenuAlert | null = totalPendingAlerts > 0 ? {
      count: totalPendingAlerts,
      severity: generalTasks > 10 ? 'critical' : 'warning',
      message: `${generalTasks} tarefa(s), ${pendingInsights} insight(s) pendente(s)`
    } : null;

    // Alerta para Vendas (pode ser expandido conforme necessário)
    const salesAlert: MenuAlert | null = null;

    return {
      inventory: inventoryAlert,
      advertisements: advertisementsAlert,
      pendings: pendingsAlert,
      sales: salesAlert
    };
  }, [pendencyStats, pendingData, advertisements, consolidatedTasks]);

  return alerts;
};
