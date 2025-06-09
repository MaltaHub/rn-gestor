import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import PendingMetrics from "@/components/pendings/PendingMetrics";
import PendingFilters from "@/components/pendings/PendingFilters";
import QuickActions from "@/components/pendings/QuickActions";
import SmartInsights from "@/components/pendings/SmartInsights";
import PendingItem from "@/components/pendings/PendingItem";
import PendingCharts from "@/components/pendings/PendingCharts";

const PendingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    store: 'all',
    type: 'all',
    priority: 'all'
  });

  // Busca tasks e insights, já trazendo dados do veículo relacionado
  const { data: tasks, isLoading: isLoadingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, vehicles:vehicle_id(id, plate, model, image_url)")
        .eq("completed", false)
        .order("prioridade", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: insights, isLoading: isLoadingInsights, refetch: refetchInsights } = useQuery({
    queryKey: ["advertisement_insights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisement_insights")
        .select("*, vehicles:vehicle_id(id, plate, model, image_url)")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: unpublishedAds, isLoading: isLoadingAds, refetch: refetchAds } = useQuery({
    queryKey: ["unpublished_advertisements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisements")
        .select("*")
        .eq("publicado", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleRefresh = () => {
    refetchTasks();
    refetchInsights();
    refetchAds();
    setSelectedItems([]);
  };

  const handleItemSelect = (id: string, selected: boolean) => {
    setSelectedItems(prev => 
      selected 
        ? [...prev, id]
        : prev.filter(item => item !== id)
    );
  };

  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const handleFilterReset = () => {
    setFilters({ store: 'all', type: 'all', priority: 'all' });
  };

  const handleInsightAction = (insight: any) => {
    console.log('Ação do insight:', insight);
    // Implementar ações específicas baseadas no tipo de insight
  };

  // Filtragem dos dados
  const filteredData = useMemo(() => {
    let allItems: any[] = [];

    // Adicionar tarefas
    if (tasks && (filters.type === 'all' || filters.type === 'tasks')) {
      const filteredTasks = tasks.filter(task => 
        (filters.store === 'all' || task.store === filters.store) &&
        (filters.priority === 'all' || task.prioridade === filters.priority)
      );
      
      allItems = [...allItems, ...filteredTasks.map(task => ({
        ...task,
        type: 'task',
        itemId: task.id,
        title: task.title,
        description: task.description,
        plate: task.vehicles?.plate,
        priority: task.prioridade,
        store: task.store,
        createdAt: task.created_at,
        vehicleId: task.vehicle_id
      }))];
    }

    // Adicionar insights
    if (insights && (filters.type === 'all' || filters.type === 'insights')) {
      const filteredInsights = insights.filter(insight => 
        (filters.store === 'all' || insight.store === filters.store)
      );
      
      allItems = [...allItems, ...filteredInsights.map(insight => ({
        ...insight,
        type: 'insight',
        itemId: insight.id,
        title: insight.insight_type,
        description: insight.description,
        plate: insight.vehicles?.plate,
        priority: 'normal', // insights não têm prioridade definida
        store: insight.store,
        createdAt: insight.created_at,
        vehicleId: insight.vehicle_id,
        insightId: insight.id
      }))];
    }

    // Adicionar anúncios não publicados
    if (unpublishedAds && (filters.type === 'all' || filters.type === 'advertisements')) {
      const filteredAds = unpublishedAds.filter(ad => 
        (filters.store === 'all' || ad.store === filters.store)
      );
      
      allItems = [...allItems, ...filteredAds.map(ad => ({
        ...ad,
        type: 'advertisement',
        itemId: ad.id,
        title: `Publicar anúncio na ${ad.platform}`,
        description: ad.description,
        plate: ad.vehicle_plates?.[0],
        priority: 'normal',
        store: ad.store,
        createdAt: ad.created_at,
        advertisementId: ad.id
      }))];
    }

    return allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, insights, unpublishedAds, filters]);

  // Cálculo de métricas
  const metrics = useMemo(() => {
    const totalTasks = tasks?.length || 0;
    const totalInsights = insights?.length || 0;
    const totalUnpublished = unpublishedAds?.length || 0;
    
    // Métricas fictícias para demonstração
    const completionRate = 78.5;
    const avgResolutionTime = 4.2;
    const trend = 'down' as const;

    return {
      totalTasks,
      totalInsights,
      totalUnpublished,
      completionRate,
      avgResolutionTime,
      trend
    };
  }, [tasks, insights, unpublishedAds]);

  const isLoading = isLoadingTasks || isLoadingInsights || isLoadingAds;

  if (isLoading) {
    return (
      <div className="content-container py-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Carregando dashboard de pendências...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard de Pendências</h1>
        <p className="text-muted-foreground">
          Centro de comando para resolução eficiente
        </p>
      </div>

      <PendingMetrics />
      
      <PendingCharts />
      
      <PendingFilters
        selectedStore={filters.store}
        selectedType={filters.type}
        selectedPriority={filters.priority}
        onStoreChange={(value) => handleFilterChange('store', value)}
        onTypeChange={(value) => handleFilterChange('type', value)}
        onPriorityChange={(value) => handleFilterChange('priority', value)}
        onReset={handleFilterReset}
      />

      <QuickActions 
        selectedItems={selectedItems} 
        onRefresh={handleRefresh}
      />

      <SmartInsights 
        insights={[]} 
        onActionClick={handleInsightAction}
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Pendências Ativas ({filteredData.length})
          </h2>
          {selectedItems.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedItems.length} itens selecionados
            </p>
          )}
        </div>

        {filteredData.length > 0 ? (
          <div className="space-y-3">
            {filteredData.map((item) => (
              <PendingItem
                key={item.itemId}
                id={item.itemId}
                type={item.type}
                title={item.title}
                description={item.description}
                plate={item.plate}
                priority={item.priority}
                store={item.store}
                createdAt={item.createdAt}
                isSelected={selectedItems.includes(item.itemId)}
                onSelect={handleItemSelect}
                onNavigate={item.vehicleId ? () => navigate(`/vehicle/${item.vehicleId}`) : undefined}
                vehicleId={item.vehicleId}
                advertisementId={item.advertisementId}
                insightId={item.insightId}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-lg font-semibold mb-2">Nenhuma pendência encontrada!</h3>
            <p className="text-muted-foreground">
              {filters.store !== 'all' || filters.type !== 'all' || filters.priority !== 'all'
                ? 'Tente ajustar os filtros para ver mais resultados.'
                : 'Parabéns! Todas as pendências foram resolvidas.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingsPage;
