
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PendingMetrics from "@/components/pendings/PendingMetrics";
import PendingFilters from "@/components/pendings/PendingFilters";
import QuickActions from "@/components/pendings/QuickActions";
import SmartInsights from "@/components/pendings/SmartInsights";
import PendingItem from "@/components/pendings/PendingItem";
import PendingCharts from "@/components/pendings/PendingCharts";
import { usePaginatedPendings } from "@/hooks/usePaginatedPendings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw } from "lucide-react";

const PendingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const {
    data: paginatedData,
    isLoading,
    pagination,
    filters,
    updateFilters,
    resetFilters,
    goToPage,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
    changePageSize,
    forceRefresh,
    metrics
  } = usePaginatedPendings({
    initialPageSize: 25
  });

  const handleItemSelect = (id: string, selected: boolean) => {
    setSelectedItems(prev => 
      selected 
        ? [...prev, id]
        : prev.filter(item => item !== id)
    );
  };

  const handleRefresh = () => {
    forceRefresh();
    setSelectedItems([]);
  };

  const handleInsightAction = (insight: any) => {
    console.log('Ação do insight:', insight);
  };

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
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Pendências</h1>
          <p className="text-muted-foreground">
            Centro de comando para resolução eficiente
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Métricas do cache */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total:</span>
              <span className="ml-2 font-semibold">{metrics.totalItems}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Filtrados:</span>
              <span className="ml-2 font-semibold">{metrics.filteredCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Página:</span>
              <span className="ml-2 font-semibold">
                {pagination.page} de {pagination.totalPages}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Cache:</span>
              <span className={`ml-2 font-semibold ${metrics.isStale ? 'text-orange-500' : 'text-green-500'}`}>
                {metrics.isStale ? 'Atualizando...' : 'Atualizado'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <PendingMetrics />
      
      <PendingCharts />
      
      <PendingFilters
        selectedStore={filters.store}
        selectedType={filters.type}
        selectedPriority={filters.priority}
        onStoreChange={(value) => updateFilters({ store: value })}
        onTypeChange={(value) => updateFilters({ type: value })}
        onPriorityChange={(value) => updateFilters({ priority: value })}
        onReset={resetFilters}
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              Pendências Ativas ({pagination.totalItems})
            </h2>
            {selectedItems.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedItems.length} itens selecionados
              </p>
            )}
          </div>

          {/* Controles de paginação */}
          <div className="flex items-center gap-2">
            <Select 
              value={pagination.pageSize.toString()} 
              onValueChange={(value) => changePageSize(parseInt(value))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={goToFirstPage}
                disabled={pagination.page === 1}
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousPage}
                disabled={pagination.page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              <span className="px-3 py-1 text-sm border rounded">
                {pagination.page} / {pagination.totalPages}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextPage}
                disabled={pagination.page === pagination.totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToLastPage}
                disabled={pagination.page === pagination.totalPages}
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {paginatedData.length > 0 ? (
          <div className="space-y-3">
            {paginatedData.map((item) => (
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
              {metrics.filterApplied
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
