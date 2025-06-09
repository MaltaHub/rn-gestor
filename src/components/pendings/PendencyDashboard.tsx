
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Camera, FileText, Car, TrendingUp } from 'lucide-react';
import { useVehiclePendencies } from '@/hooks/useVehiclePendencies';
import { usePendingCache } from '@/hooks/usePendingCache';
import PendencyCard from './PendencyCard';
import PendingItem from './PendingItem';

const PendencyDashboard: React.FC = () => {
  const { pendencies, stats, isLoading: isLoadingPendencies } = useVehiclePendencies();
  const { data: pendingData, isLoading: isLoadingCache } = usePendingCache();
  const [selectedTab, setSelectedTab] = useState('pendencies');

  if (isLoadingPendencies || isLoadingCache) {
    return (
      <div className="content-container py-6">
        <div className="floating-box">
          <div className="p-6 text-center">Carregando...</div>
        </div>
      </div>
    );
  }

  // Filtrar apenas tarefas de publicação para a aba de Tarefas
  const publicationTasks = pendingData.tasks.filter(task => 
    task.tipo_tarefa === 'geral' && 
    task.title?.includes('Publicar anúncio') && 
    !task.completed
  );

  const generalTasks = pendingData.tasks.filter(task => 
    !task.completed && 
    (!task.title?.includes('Publicar anúncio') || task.tipo_tarefa !== 'geral')
  );

  return (
    <div className="content-container py-6">
      <div className="floating-box">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold">Sistema de Pendências e Tarefas</h1>
          <p className="text-muted-foreground">
            Gerencie pendências dos veículos e tarefas de publicação
          </p>
        </div>

        {/* Stats Cards */}
        <div className="p-6 border-b">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-red-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Fotos Faltantes</p>
                    <p className="text-2xl font-bold">{stats.byType.missing_photos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Anúncios Faltantes</p>
                    <p className="text-2xl font-bold">{stats.byType.missing_ads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Info. Incompletas</p>
                    <p className="text-2xl font-bold">{stats.byType.incomplete_info}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Doc. Pendentes</p>
                    <p className="text-2xl font-bold">{stats.byType.document_pending}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="pendencies" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Pendências do Estoque
                {stats.total > 0 && (
                  <Badge variant="destructive" className="ml-1 px-1 py-0 text-xs">
                    {stats.total}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="publication" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Tarefas de Publicação
                {publicationTasks.length > 0 && (
                  <Badge variant="default" className="ml-1 px-1 py-0 text-xs">
                    {publicationTasks.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                Outras Tarefas
                {generalTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1 py-0 text-xs">
                    {generalTasks.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="insights" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Insights
                {pendingData.insights.length > 0 && (
                  <Badge variant="outline" className="ml-1 px-1 py-0 text-xs">
                    {pendingData.insights.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pendencies" className="px-6 pb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Pendências dos Veículos</h3>
                <Badge variant="outline">
                  {stats.critical} crítica(s) de {stats.total} total
                </Badge>
              </div>
              
              {pendencies.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <AlertTriangle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhuma pendência encontrada!</h3>
                    <p className="text-muted-foreground">
                      Todos os veículos estão com informações completas.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendencies.map(pendency => (
                    <PendencyCard key={pendency.id} pendency={pendency} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="publication" className="px-6 pb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Tarefas de Publicação de Anúncios</h3>
                <Badge variant="outline">{publicationTasks.length} pendente(s)</Badge>
              </div>
              
              {publicationTasks.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhuma tarefa de publicação!</h3>
                    <p className="text-muted-foreground">
                      Todos os anúncios estão publicados.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {publicationTasks.map(task => (
                    <PendingItem
                      key={task.id}
                      id={task.id}
                      type="task"
                      title={task.title}
                      description={task.description}
                      plate={task.vehicles?.plate}
                      priority={task.prioridade}
                      store={task.store}
                      createdAt={task.created_at}
                      isSelected={false}
                      onSelect={() => {}}
                      vehicleId={task.vehicle_id}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="px-6 pb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Outras Tarefas</h3>
                <Badge variant="outline">{generalTasks.length} pendente(s)</Badge>
              </div>
              
              {generalTasks.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Car className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhuma tarefa pendente!</h3>
                    <p className="text-muted-foreground">
                      Todas as tarefas foram concluídas.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {generalTasks.map(task => (
                    <PendingItem
                      key={task.id}
                      id={task.id}
                      type="task"
                      title={task.title}
                      description={task.description}
                      plate={task.vehicles?.plate}
                      priority={task.prioridade}
                      store={task.store}
                      createdAt={task.created_at}
                      isSelected={false}
                      onSelect={() => {}}
                      vehicleId={task.vehicle_id}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="insights" className="px-6 pb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Insights do Sistema</h3>
                <Badge variant="outline">{pendingData.insights.length} ativo(s)</Badge>
              </div>
              
              {pendingData.insights.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <TrendingUp className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhum insight ativo!</h3>
                    <p className="text-muted-foreground">
                      O sistema não detectou oportunidades de melhoria.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {pendingData.insights.map(insight => (
                    <PendingItem
                      key={insight.id}
                      id={insight.id}
                      type="insight"
                      title={insight.insight_type}
                      description={insight.description}
                      plate={insight.vehicles?.plate}
                      store={insight.store}
                      createdAt={insight.created_at}
                      isSelected={false}
                      onSelect={() => {}}
                      vehicleId={insight.vehicle_id}
                      insightId={insight.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PendencyDashboard;
