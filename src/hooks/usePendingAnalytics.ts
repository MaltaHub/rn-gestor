
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

export interface PendingAnalytics {
  totalTasks: number;
  totalInsights: number;
  totalUnpublished: number;
  completionRate: number;
  avgResolutionTime: number;
  trend: 'up' | 'down' | 'stable';
  tasksCompletedToday: number;
  insightsResolvedToday: number;
  adsPublishedToday: number;
  oldestPendingDays: number;
  performanceByStore: {
    store: string;
    completionRate: number;
    avgTime: number;
  }[];
  weeklyTrend: {
    week: string;
    completed: number;
    created: number;
  }[];
}

export const usePendingAnalytics = () => {
  const { currentStore } = useStore();

  return useQuery({
    queryKey: ['pending-analytics', currentStore],
    queryFn: async (): Promise<PendingAnalytics> => {
      console.log('PendingAnalytics - Iniciando busca de métricas para:', currentStore);

      // Buscar tarefas pendentes e completadas usando a nova estrutura
      const { data: allTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('ref_table', 'vehicles');

      if (tasksError) {
        console.error('Erro ao buscar tarefas:', tasksError);
        throw tasksError;
      }

      // Buscar insights pendentes e resolvidos
      const { data: allInsights, error: insightsError } = await supabase
        .from('advertisement_insights')
        .select('*')
        .eq('store', currentStore);

      if (insightsError) {
        console.error('Erro ao buscar insights:', insightsError);
        throw insightsError;
      }

      // Buscar anúncios publicados e não publicados
      const { data: allAds, error: adsError } = await supabase
        .from('advertisements')
        .select('*')
        .eq('store', currentStore);

      if (adsError) {
        console.error('Erro ao buscar anúncios:', adsError);
        throw adsError;
      }

      // Calcular métricas básicas usando o campo 'status' que agora é um enum
      const pendingTasks = allTasks?.filter(task => task.status === 'pending') || [];
      const completedTasks = allTasks?.filter(task => task.status === 'completed') || [];
      const pendingInsights = allInsights?.filter(insight => !insight.resolved) || [];
      const resolvedInsights = allInsights?.filter(insight => insight.resolved) || [];
      const unpublishedAds = allAds?.filter(ad => !ad.publicado) || [];
      const publishedAds = allAds?.filter(ad => ad.publicado) || [];

      // Taxa de conclusão geral
      const totalPendings = pendingTasks.length + pendingInsights.length + unpublishedAds.length;
      const totalCompleted = completedTasks.length + resolvedInsights.length + publishedAds.length;
      const completionRate = totalCompleted + totalPendings > 0 
        ? (totalCompleted / (totalCompleted + totalPendings)) * 100 
        : 0;

      // Tempo médio de resolução usando os campos sincronizados
      const avgResolutionTime = calculateAverageResolutionTime(
        completedTasks,
        resolvedInsights,
        publishedAds
      );

      // Métricas de hoje usando completed_at que agora está sincronizado
      const today = new Date().toISOString().split('T')[0];
      const tasksCompletedToday = completedTasks.filter(task => 
        task.completed_at && task.completed_at.startsWith(today)
      ).length;
      
      const insightsResolvedToday = resolvedInsights.filter(insight => 
        insight.resolved_at && insight.resolved_at.startsWith(today)
      ).length;
      
      const adsPublishedToday = publishedAds.filter(ad => 
        ad.data_publicacao && ad.data_publicacao.startsWith(today)
      ).length;

      // Pendência mais antiga
      const oldestPendingDays = calculateOldestPending(
        pendingTasks,
        pendingInsights,
        unpublishedAds
      );

      // Tendência semanal
      const weeklyTrend = calculateWeeklyTrend(allTasks || [], allInsights || [], allAds || []);
      const trend = calculateTrend(weeklyTrend);

      // Performance por loja
      const performanceByStore = [{
        store: currentStore,
        completionRate,
        avgTime: avgResolutionTime
      }];

      const analytics: PendingAnalytics = {
        totalTasks: pendingTasks.length,
        totalInsights: pendingInsights.length,
        totalUnpublished: unpublishedAds.length,
        completionRate,
        avgResolutionTime,
        trend,
        tasksCompletedToday,
        insightsResolvedToday,
        adsPublishedToday,
        oldestPendingDays,
        performanceByStore,
        weeklyTrend
      };

      console.log('PendingAnalytics - Métricas calculadas:', analytics);
      return analytics;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000
  });
};

// Funções auxiliares atualizadas para usar completed_at
function calculateAverageResolutionTime(
  completedTasks: any[],
  resolvedInsights: any[],
  publishedAds: any[]
): number {
  const resolutions: number[] = [];

  // Tarefas completadas usando completed_at
  completedTasks.forEach(task => {
    if (task.created_at && task.completed_at) {
      const created = new Date(task.created_at);
      const completed = new Date(task.completed_at);
      const hours = (completed.getTime() - created.getTime()) / (1000 * 60 * 60);
      resolutions.push(hours);
    }
  });

  // Insights resolvidos
  resolvedInsights.forEach(insight => {
    if (insight.created_at && insight.resolved_at) {
      const created = new Date(insight.created_at);
      const resolved = new Date(insight.resolved_at);
      const hours = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
      resolutions.push(hours);
    }
  });

  // Anúncios publicados
  publishedAds.forEach(ad => {
    if (ad.created_at && ad.data_publicacao) {
      const created = new Date(ad.created_at);
      const published = new Date(ad.data_publicacao);
      const hours = (published.getTime() - created.getTime()) / (1000 * 60 * 60);
      resolutions.push(hours);
    }
  });

  return resolutions.length > 0 
    ? resolutions.reduce((sum, time) => sum + time, 0) / resolutions.length 
    : 0;
}

function calculateOldestPending(
  pendingTasks: any[],
  pendingInsights: any[],
  unpublishedAds: any[]
): number {
  const dates: Date[] = [];

  pendingTasks.forEach(task => {
    if (task.created_at) dates.push(new Date(task.created_at));
  });

  pendingInsights.forEach(insight => {
    if (insight.created_at) dates.push(new Date(insight.created_at));
  });

  unpublishedAds.forEach(ad => {
    if (ad.created_at) dates.push(new Date(ad.created_at));
  });

  if (dates.length === 0) return 0;

  const oldest = Math.min(...dates.map(d => d.getTime()));
  const now = new Date().getTime();
  return Math.floor((now - oldest) / (1000 * 60 * 60 * 24));
}

function calculateWeeklyTrend(allTasks: any[], allInsights: any[], allAds: any[]) {
  const weeks = [];
  const now = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (i * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    let completed = 0;
    let created = 0;

    // Contar criações e conclusões da semana usando completed_at
    allTasks.forEach(task => {
      if (task.created_at >= weekStartStr && task.created_at <= weekEndStr) {
        created++;
      }
      if (task.completed_at && task.completed_at >= weekStartStr && task.completed_at <= weekEndStr) {
        completed++;
      }
    });

    allInsights.forEach(insight => {
      if (insight.created_at >= weekStartStr && insight.created_at <= weekEndStr) {
        created++;
      }
      if (insight.resolved && insight.resolved_at >= weekStartStr && insight.resolved_at <= weekEndStr) {
        completed++;
      }
    });

    allAds.forEach(ad => {
      if (ad.created_at >= weekStartStr && ad.created_at <= weekEndStr) {
        created++;
      }
      if (ad.publicado && ad.data_publicacao >= weekStartStr && ad.data_publicacao <= weekEndStr) {
        completed++;
      }
    });

    weeks.push({
      week: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
      completed,
      created
    });
  }

  return weeks;
}

function calculateTrend(weeklyData: any[]): 'up' | 'down' | 'stable' {
  if (weeklyData.length < 2) return 'stable';
  
  const lastWeek = weeklyData[weeklyData.length - 1];
  const previousWeek = weeklyData[weeklyData.length - 2];
  
  const lastWeekRate = lastWeek.created > 0 ? lastWeek.completed / lastWeek.created : 0;
  const previousWeekRate = previousWeek.created > 0 ? previousWeek.completed / previousWeek.created : 0;
  
  if (lastWeekRate > previousWeekRate + 0.1) return 'up';
  if (lastWeekRate < previousWeekRate - 0.1) return 'down';
  return 'stable';
}
