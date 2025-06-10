
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { ActionCard } from './ActionCard';
import { useVehiclePendencies } from '@/hooks/useVehiclePendencies';
import { useConsolidatedTasks } from '@/hooks/useConsolidatedTasks';
import { useRealTaskManager } from '@/hooks/useRealTaskManager';

export const SmartActionsList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  const { pendencies } = useVehiclePendencies();
  const { data: consolidatedTasks = [], refetch: refetchTasks } = useConsolidatedTasks();
  const { completeTask, resolvePendency, syncTasks, isCompleting, isResolving, isSyncing } = useRealTaskManager();

  // Combinar pendências e tarefas consolidadas
  const allActions = [
    ...pendencies.map(p => ({
      id: p.id,
      type: 'pendency' as const,
      title: p.title,
      description: p.description,
      priority: p.severity as 'baixa' | 'normal' | 'alta' | 'critical' | 'high' | 'medium' | 'low',
      plate: p.plate,
      store: p.store,
      createdAt: p.createdAt,
      pendencyType: p.type,
      vehicleId: p.vehicleId
    })),
    ...consolidatedTasks
      .filter(t => t.status === 'pending') // Apenas tarefas pendentes
      .map(t => ({
        id: t.task_id,
        type: 'task' as const,
        title: t.title,
        description: t.description || '',
        priority: t.priority as 'baixa' | 'normal' | 'alta' | 'critical' | 'high' | 'medium' | 'low',
        plate: t.vehicle_plate,
        store: t.store,
        createdAt: t.created_at,
        vehicleId: t.vehicle_id
      }))
  ];

  // Filtrar ações
  const filteredActions = allActions.filter(action => {
    const matchesSearch = 
      action.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      action.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      action.plate?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || action.type === filterType;
    const matchesPriority = filterPriority === 'all' || action.priority === filterPriority;
    
    return matchesSearch && matchesType && matchesPriority;
  });

  // Ordenar por prioridade
  const priorityOrder = { critical: 0, alta: 1, high: 2, normal: 3, medium: 4, baixa: 5, low: 6 };
  const sortedActions = filteredActions.sort((a, b) => {
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 999;
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 999;
    return aPriority - bPriority;
  });

  const handleResolve = async (action: any) => {
    if (action.type === 'pendency') {
      await resolvePendency.mutateAsync({
        type: action.pendencyType,
        identifier: action.id,
        method: 'manual'
      });
    }
  };

  const handleComplete = async (action: any) => {
    if (action.type === 'task') {
      await completeTask.mutateAsync(action.id);
    }
  };

  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    syncTasks.mutate();
    refetchTasks();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Ações Prioritárias</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Atualizar'}
          </Button>
        </div>
        
        {/* Filtros */}
        <div className="flex gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Buscar por placa, título..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendency">Pendências</SelectItem>
              <SelectItem value="task">Tarefas</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Prioridade</SelectItem>
              <SelectItem value="critical">Crítica</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <CardContent>
        {sortedActions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhuma ação encontrada.</p>
            {searchTerm && (
              <p className="text-sm mt-2">Tente ajustar os filtros de busca.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedActions.map((action) => (
              <ActionCard
                key={`${action.type}-${action.id}`}
                id={action.id}
                type={action.type}
                title={action.title}
                description={action.description}
                priority={action.priority}
                plate={action.plate}
                store={action.store}
                createdAt={action.createdAt}
                onResolve={() => handleResolve(action)}
                onComplete={() => handleComplete(action)}
                isLoading={isResolving || isCompleting}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
